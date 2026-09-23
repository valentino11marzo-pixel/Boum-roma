#!/usr/bin/env python3
"""Existing outbox: exact JSON text, private send/ACK receipts, no automatic resend.

Receipts store action ID, fingerprint and outcome, never message/contact contents.
"""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import tempfile
import time
from urllib import error, request

BASE = "https://www.boomrome.com"
OUTBOX = "/api/homie/wa-outbox"
PULL_TIMEOUT = 75  # Server limit 60 seconds plus connection/response overhead.
ACK_TIMEOUT = 20
STATES = {"received", "sending", "sent", "uncertain", "not_sent"}


def stamp():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def action_key(action_id):
    return hashlib.sha256(action_id.encode("utf-8")).hexdigest()


def fingerprint(message):
    return hashlib.sha256(json.dumps({k: message[k] for k in ("actionId", "phone", "text")},
                                    ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()


def parse_messages(data):
    """Validate the whole batch before sending. Never trim or rewrite text."""
    if not isinstance(data, dict) or data.get("ok") is not True or not isinstance(data.get("messages"), list):
        raise ValueError("invalid_pull")
    if len(data["messages"]) > 10:
        raise ValueError("invalid_batch_size")
    result, seen = [], set()
    for row in data["messages"]:
        if not isinstance(row, dict):
            raise ValueError("invalid_message")
        action_id, phone, text = (row.get(k) for k in ("actionId", "phone", "text"))
        if not isinstance(action_id, str) or not re.fullmatch(r"[\w.:-]{1,180}", action_id, flags=re.ASCII):
            raise ValueError("invalid_action")
        if action_id in seen:
            raise ValueError("duplicate_action")
        phone_ok = isinstance(phone, str) and (re.fullmatch(r"[+()0-9 -]{6,40}", phone)
                    and 6 <= len(re.sub(r"[^0-9]", "", phone)) <= 15
                    or re.fullmatch(r"[0-9]+@(s\.whatsapp\.net|lid)|[0-9]+(-[0-9]+)?@g\.us", phone))
        if not phone_ok:
            raise ValueError("invalid_recipient")
        if not isinstance(text, str) or not text.strip() or "\x00" in text or len(text) > 10000:
            raise ValueError("invalid_text")
        name = row.get("name")
        result.append({"actionId": action_id, "phone": phone, "text": text,
                       "name": name if isinstance(name, str) else ""})
        seen.add(action_id)
    return result


class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None  # Never forward secrets or approved text to redirect targets.


class Transport:
    def __init__(self, secret):
        self.secret = secret
        self.opener = request.build_opener(NoRedirect())

    def post(self, path, payload, timeout):
        if path not in (OUTBOX, "/api/homie/message"):
            raise ValueError("invalid_endpoint")
        req = request.Request(BASE + path, data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
                              headers={"Content-Type": "application/json", "X-Homie-Secret": self.secret}, method="POST")
        try:
            with self.opener.open(req, timeout=timeout) as response:
                raw = response.read(512001)
                if len(raw) > 512000:
                    raise ValueError("response_too_large")
                return response.status, json.loads(raw.decode("utf-8"))
        except error.HTTPError as exc:
            return exc.code, {}  # Never expose potentially sensitive error bodies.


class Sender:
    def __init__(self, helper):
        self.helper = Path(helper)

    def available(self):
        return self.helper.is_file() and os.access(self.helper, os.X_OK)

    def __call__(self, phone, text):
        # No shell interpolation, old binary fallback or helper output in logs.
        return subprocess.run(["/bin/bash", str(self.helper), phone, text],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=195).returncode


class Receipts:
    def __init__(self, directory):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.directory.chmod(0o700)
        self.lockfile = None

    def acquire(self):
        self.lockfile = open(self.directory / ".lock", "a+")
        os.chmod(self.lockfile.name, 0o600)
        try:
            fcntl.flock(self.lockfile, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            self.lockfile.close()
            self.lockfile = None
            return False
        return True

    def close(self):
        if self.lockfile:
            self.lockfile.close()
            self.lockfile = None

    def read_all(self):
        rows = []
        for path in sorted(self.directory.glob("*.json")):
            row = json.loads(path.read_text(encoding="utf-8"))
            if (not isinstance(row, dict) or not isinstance(row.get("actionId"), str)
                    or path.stem != action_key(row["actionId"]) or row.get("state") not in STATES
                    or row.get("ackStatus") not in ("pending", "acked", "conflict")
                    or not re.fullmatch(r"[a-f0-9]{64}", row.get("payloadHash", ""))):
                raise ValueError("receipt_invalid")
            rows.append(row)
        return rows

    def write(self, row):
        path = self.directory / (action_key(row["actionId"]) + ".json")
        fd, tmp = tempfile.mkstemp(dir=self.directory, prefix=".receipt-")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as stream:
                json.dump(row, stream, ensure_ascii=False, sort_keys=True)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(tmp, path)
            directory_fd = os.open(self.directory, os.O_RDONLY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
        finally:
            if os.path.exists(tmp):
                os.unlink(tmp)


class Outbox:
    def __init__(self, receipts, transport, sender, hold, log=lambda event, key="": None, stopping=lambda: False):
        self.receipts, self.transport, self.sender = receipts, transport, sender
        self.hold, self.log, self.stopping = hold, log, stopping

    def paused(self):
        return self.hold() or self.stopping()

    def event(self, event, action_id=""):
        self.log(event, action_key(action_id)[:12] if action_id else "")

    def acknowledge(self, row):
        if self.paused() or row["ackStatus"] != "pending":
            return
        payload = {"op": "ack", "actionId": row["actionId"], "ok": row["state"] == "sent"}
        if not payload["ok"]:
            payload["error"] = "send_outcome_unknown" if row["state"] == "uncertain" else "send_not_started"
        try:
            status, data = self.transport.post(OUTBOX, payload, ACK_TIMEOUT)
        except Exception:
            self.event("ack_pending", row["actionId"])
            return
        if status == 200 and isinstance(data, dict) and data.get("ok") is True:
            expected = "sent" if payload["ok"] else "failed"
            if row["actionId"].startswith("sgreply_") and data.get("delivery") != expected:
                self.event("ack_invalid", row["actionId"])
                return
            row.update(ackStatus="acked", acknowledgedAt=stamp())
        elif status in (400, 404, 409):
            row.update(ackStatus="conflict", ackCode=status)
        else:
            self.event("ack_pending", row["actionId"])
            return
        self.receipts.write(row)
        self.event("ack_" + row["ackStatus"], row["actionId"])

    def cycle(self):
        if self.paused():
            return "hold"
        rows = self.receipts.read_all()  # Corrupt journal stops new pickup/send.
        for row in rows:
            if row["state"] in ("received", "sending"):
                row.update(state="uncertain" if row["state"] == "sending" else "not_sent", finishedAt=stamp())
                self.receipts.write(row)
            self.acknowledge(row)
        if any(row["ackStatus"] != "acked" for row in rows):
            return "ack_pending"  # Recover receipts before accepting more work.
        if self.paused():
            return "hold"
        if hasattr(self.sender, "available") and not self.sender.available():
            self.event("sender_unavailable")
            return "sender_unavailable"
        try:
            status, data = self.transport.post(OUTBOX, {"op": "pull"}, PULL_TIMEOUT)
            if status != 200:
                raise ValueError("pull_rejected")
            messages = parse_messages(data)
        except Exception:
            self.event("pull_unavailable")
            return "pull_unavailable"
        known = {row["actionId"]: row for row in rows}
        fresh = []
        # Persist every pickup before any send. Message contents remain ephemeral.
        for message in messages:
            action_id, digest = message["actionId"], fingerprint(message)
            if action_id in known:
                self.event("duplicate_action" if known[action_id]["payloadHash"] == digest else "payload_changed", action_id)
                continue
            row = {"actionId": action_id, "payloadHash": digest, "state": "received", "ackStatus": "pending", "receivedAt": stamp()}
            self.receipts.write(row)
            fresh.append((message, row))
        for message, row in fresh:
            action_id = row["actionId"]
            if self.paused():
                row.update(state="not_sent", finishedAt=stamp())
                self.receipts.write(row)
                continue
            row.update(state="sending", startedAt=stamp())
            self.receipts.write(row)  # Durable guard MUST precede the send subprocess.
            if self.paused():
                row.update(state="not_sent", finishedAt=stamp())
                self.receipts.write(row)
                continue
            try:
                sent = self.sender(message["phone"], message["text"]) == 0
            except Exception:
                sent = False  # An error can follow actual delivery: never auto-resend.
            row.update(state="sent" if sent else "uncertain", finishedAt=stamp())
            self.receipts.write(row)  # Persist result before ACK/network follow-up.
            self.event("send_" + row["state"], action_id)
            self.acknowledge(row)
            if sent and not self.paused():
                # Existing outbound tracking, best effort; ACK recovery never repeats it.
                payload = {"direction": "out", "channel": "whatsapp", "phone": message["phone"],
                           "name": message["name"], "body": message["text"], "messageId": "outbox-" + action_id,
                           "timestamp": row["finishedAt"]}
                try:
                    self.transport.post("/api/homie/message", payload, 10)
                except Exception:
                    self.event("tracking_unavailable", action_id)
        return "processed"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true", help="One cycle; respects HOLD and all delivery guards")
    args = parser.parse_args()
    os.umask(0o077)
    home = Path.home()
    private = home / ".boom"
    receipts = Receipts(private / "wa-outbox-receipts")
    if not receipts.acquire():
        return 0
    running = True

    def stop(_signum, _frame):
        nonlocal running
        running = False

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)

    def log(event, key=""):
        with open(private / "wa-outbox.log", "a", encoding="utf-8") as stream:
            stream.write("%s [outbox] %s%s\n" % (stamp(), event, (" ref=" + key) if key else ""))

    try:
        secret = os.environ.get("HOMIE_SECRET", "")
        if not secret:
            log("secret_unavailable")
            return 1
        try:
            poll = max(10, int(os.environ.get("POLL_SECS_OUTBOX", "180")))
        except ValueError:
            poll = 180
        worker = Outbox(receipts, Transport(secret), Sender(home / ".openclaw/workspace/send_whatsapp.sh"),
                        lambda: (private / "wa-outbound-hold").exists(), log, lambda: not running)
        while running:
            try:
                outcome = worker.cycle()
            except Exception:
                log("local_state_error")  # No raw errors, paths, credentials or contents.
                return 1
            if args.once:
                return 0
            until = time.monotonic() + (20 if outcome == "hold" else poll)
            while running and time.monotonic() < until:
                time.sleep(min(1, max(0, until - time.monotonic())))
    finally:
        receipts.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
