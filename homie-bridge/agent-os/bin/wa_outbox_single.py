#!/usr/bin/env python3
"""One explicitly selected, approved action; ordinary outbox remains on HOLD.

The receipt directory, lock and legacy payloadHash are shared with wa_outbox.
wireBinding is additional metadata, never an alternate queue or approval.
Inspect is read-only; recovery can ACK but cannot resend. No general pull/mirror.
"""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import stat
import subprocess
from urllib import error, request

from wa_outbox import (ACK_TIMEOUT, BASE, PULL_TIMEOUT, NoRedirect, Receipts,
                       Sender, action_key, fingerprint, parse_messages, stamp)

PROTOCOL = "homie-wa-single-v1"
ENDPOINT = "/api/homie/wa-outbox-single"
SERVICE = "com.boomrome.wa-outbox"
ID_RE = re.compile(r"sgreply_[a-f0-9]{40}\Z", re.ASCII)
HASH_RE = re.compile(r"[a-f0-9]{64}\Z", re.ASCII)
TIME_RE = re.compile(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ\Z", re.ASCII)
TERMINAL = {"sent", "uncertain", "not_sent"}


def wire_hash(message):
    raw = json.dumps([message[k] for k in ("actionId", "phone", "text")],
                     ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def valid_action(value):
    return isinstance(value, str) and ID_RE.fullmatch(value) is not None


def valid_hash(value):
    return isinstance(value, str) and HASH_RE.fullmatch(value) is not None


def valid_revision(value):
    if not isinstance(value, str) or any(ord(c) < 32 or ord(c) == 127 for c in value):
        return False
    try:
        # Match JavaScript string.length without accepting unpaired surrogates.
        return 0 < len(value.encode("utf-16-le")) // 2 <= 256
    except UnicodeEncodeError:
        return False


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate_json_key")
        result[key] = value
    return result


class SingleTransport:
    """Dedicated allowlist: no fallback, redirect, retry or secret-bearing error."""
    def __init__(self, secret):
        self.secret = secret
        self.opener = request.build_opener(NoRedirect())

    def post(self, path, payload, timeout):
        if path != ENDPOINT:
            raise ValueError("invalid_endpoint")
        req = request.Request(BASE + path,
                              data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
                              headers={"Content-Type": "application/json", "X-Homie-Secret": self.secret},
                              method="POST")
        try:
            with self.opener.open(req, timeout=timeout) as response:
                raw = response.read(512001)
                if len(raw) > 512000:
                    raise ValueError("response_too_large")
                return response.status, json.loads(raw.decode("utf-8"), object_pairs_hook=unique_object)
        except error.HTTPError as exc:
            return exc.code, {}


class TargetReceipts(Receipts):
    """Same directory/flock and durable writer; only selected receipt is read.

    Construction has no filesystem side effects. The mutable path is opened only
    by send/ack; inspect never constructs this object through the CLI.
    """
    def __init__(self, directory):
        self.directory = Path(directory)
        self.lockfile = None

    def acquire(self):
        self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        info = self.directory.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_mode & 0o077 or info.st_uid != os.getuid():
            raise ValueError("receipt_directory_invalid")
        flags = os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0)
        fd = os.open(self.directory / ".lock", flags, 0o600)
        try:
            info = os.fstat(fd)
            if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_mode & 0o077 or info.st_uid != os.getuid():
                raise ValueError("receipt_lock_invalid")
            self.lockfile = os.fdopen(fd, "a+")
            fd = None
            try:
                fcntl.flock(self.lockfile, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                self.close()
                return False
            return True
        finally:
            if fd is not None:
                os.close(fd)

    @staticmethod
    def validate(row, action_id, binding):
        allowed = {"actionId", "payloadHash", "wireBinding", "state", "ackStatus", "receivedAt",
                   "startedAt", "finishedAt", "acknowledgedAt", "ackCode"}
        if not isinstance(row, dict) or set(row) - allowed or row.get("actionId") != action_id:
            raise ValueError("receipt_invalid")
        if (not valid_action(action_id) or not isinstance(binding, dict)
                or set(binding) != {"protocol", "revision", "payloadHash"}
                or binding.get("protocol") != PROTOCOL or not valid_revision(binding.get("revision"))
                or not valid_hash(binding.get("payloadHash")) or row.get("wireBinding") != binding
                or not valid_hash(row.get("payloadHash"))):
            raise ValueError("receipt_binding_invalid")
        state, ack = row.get("state"), row.get("ackStatus")
        if state not in {"received", "sending"} | TERMINAL or ack not in {"pending", "acked", "conflict"}:
            raise ValueError("receipt_state_invalid")
        for name in ("receivedAt", "startedAt", "finishedAt", "acknowledgedAt"):
            if name in row and (not isinstance(row[name], str) or not TIME_RE.fullmatch(row[name])):
                raise ValueError("receipt_timestamp_invalid")
        if "receivedAt" not in row or (state in {"sending", "sent", "uncertain"} and "startedAt" not in row):
            raise ValueError("receipt_timestamp_missing")
        if state in TERMINAL and "finishedAt" not in row:
            raise ValueError("receipt_timestamp_missing")
        if state not in TERMINAL and (ack != "pending" or "finishedAt" in row):
            raise ValueError("receipt_state_invalid")
        if (ack == "acked") != ("acknowledgedAt" in row):
            raise ValueError("receipt_ack_invalid")
        if ack == "conflict":
            if type(row.get("ackCode")) is not int or row["ackCode"] not in (400, 404, 409):
                raise ValueError("receipt_ack_invalid")
        elif "ackCode" in row:
            raise ValueError("receipt_ack_invalid")
        return row

    def read_target(self, action_id, binding):
        path = self.directory / (action_key(action_id) + ".json")
        try:
            fd = os.open(path, os.O_RDONLY | os.O_NONBLOCK | getattr(os, "O_NOFOLLOW", 0))
        except FileNotFoundError:
            return None
        with os.fdopen(fd, "r", encoding="utf-8") as stream:
            info = os.fstat(stream.fileno())
            if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_size > 8192
                    or info.st_mode & 0o077 or info.st_uid != os.getuid()):
                raise ValueError("receipt_file_invalid")
            row = json.loads(stream.read(8193), object_pairs_hook=unique_object)
        return self.validate(row, action_id, binding)

    def write(self, row):
        self.validate(row, row.get("actionId"), row.get("wireBinding"))
        super().write(row)


def ordinary_unloaded():
    """Read-only metadata; process absence alone cannot establish unloaded state."""
    try:
        probe = subprocess.run(["/bin/launchctl", "list"], capture_output=True, text=True, timeout=10)
    except Exception:
        return None
    if probe.returncode != 0:
        return None
    lines = probe.stdout.splitlines()
    if not lines or lines[0].split() != ["PID", "Status", "Label"]:
        return None
    return not any(line.split() and line.split()[-1] == SERVICE for line in lines[1:])


def hold_present(path):
    try:
        return stat.S_ISREG(Path(path).lstat().st_mode)
    except OSError:
        return False


class SingleOutbox:
    def __init__(self, receipts, transport, sender, hold, unloaded, stopping=lambda: False):
        self.receipts, self.transport, self.sender = receipts, transport, sender
        self.hold, self.unloaded, self.stopping = hold, unloaded, stopping

    @staticmethod
    def result(outcome, row=None, **metadata):
        result = {"protocol": PROTOCOL, "outcome": outcome, "observedAt": stamp(),
                  "sessionReadiness": "not_verified"}
        if row:
            result.update({k: row[k] for k in ("state", "ackStatus", "receivedAt", "startedAt", "finishedAt", "acknowledgedAt") if k in row})
        result.update(metadata)
        return result

    def guard(self):
        try:
            if self.stopping():
                return "stopped"
            if not self.hold():
                return "ordinary_hold_missing"
            unloaded = self.unloaded()
            if unloaded is not True:
                return "ordinary_service_loaded" if unloaded is False else "ordinary_service_unknown"
            return None
        except Exception:
            return "guard_unavailable"

    @staticmethod
    def binding(revision, digest):
        return {"protocol": PROTOCOL, "revision": revision, "payloadHash": digest}

    @staticmethod
    def matching(data, action_id, binding):
        return (isinstance(data, dict) and data.get("ok") is True and data.get("actionId") == action_id
                and all(data.get(k) == value for k, value in binding.items()))

    def inspect(self, action_id):
        if not valid_action(action_id):
            return self.result("invalid_selection")
        if self.stopping():
            return self.result("stopped")
        try:
            status, data = self.transport.post(ENDPOINT, {"protocol": PROTOCOL, "op": "inspect", "actionId": action_id}, PULL_TIMEOUT)
            if status != 200:
                return self.result("endpoint_unavailable" if status == 404 else "inspect_rejected")
            if (not isinstance(data, dict) or data.get("ok") is not True or data.get("protocol") != PROTOCOL
                    or data.get("actionId") != action_id or not valid_revision(data.get("revision"))
                    or not valid_hash(data.get("payloadHash")) or any(k in data for k in ("messages", "phone", "text"))):
                return self.result("inspect_invalid")
            return self.result("inspected", actionId=action_id, revision=data["revision"], payloadHash=data["payloadHash"])
        except Exception:
            return self.result("inspect_unavailable")

    def recover(self, row):
        if row["state"] in ("received", "sending"):
            row.update(state="uncertain" if row["state"] == "sending" else "not_sent", finishedAt=stamp())
            self.receipts.write(row)
        return row

    def acknowledge(self, action_id, binding, row):
        blocked = self.guard()
        if blocked:
            return self.result(blocked, row)
        if row["ackStatus"] != "pending":
            return self.result("already_acked" if row["ackStatus"] == "acked" else "ack_conflict", row)
        payload = {**binding, "op": "ack", "actionId": action_id, "ok": row["state"] == "sent"}
        if not payload["ok"]:
            payload["error"] = "send_outcome_unknown" if row["state"] == "uncertain" else "send_not_started"
        try:
            status, data = self.transport.post(ENDPOINT, payload, ACK_TIMEOUT)
        except Exception:
            return self.result("ack_pending", row)
        if status == 200:
            expected = "sent" if payload["ok"] else "failed"
            if not self.matching(data, action_id, binding) or data.get("delivery") != expected:
                return self.result("ack_invalid", row)
            row.update(ackStatus="acked", acknowledgedAt=stamp())
        elif status in (400, 404, 409):
            row.update(ackStatus="conflict", ackCode=status)
        else:
            return self.result("ack_pending", row)
        self.receipts.write(row)
        return self.result("ack_registered" if row["ackStatus"] == "acked" else "ack_conflict", row)

    def run(self, operation, action_id, revision, digest, execute=False):
        if operation not in ("send", "ack") or execute is not True:
            return self.result("execution_not_authorized")
        if not valid_action(action_id) or not valid_revision(revision) or not valid_hash(digest):
            return self.result("invalid_selection")
        blocked = self.guard()
        if blocked:
            return self.result(blocked)
        binding = self.binding(revision, digest)
        try:
            if not self.receipts.acquire():
                return self.result("locked")
            blocked = self.guard()
            if blocked:
                return self.result(blocked)
            row = self.receipts.read_target(action_id, binding)
            if row is not None:
                row = self.recover(row)
                if operation == "ack":
                    return self.acknowledge(action_id, binding, row)
                return self.result("existing_receipt", row)
            if operation == "ack":
                return self.result("receipt_missing")
            if hasattr(self.sender, "available") and not self.sender.available():
                return self.result("sender_helper_unavailable")
            blocked = self.guard()
            if blocked:
                return self.result(blocked)
            try:
                status, data = self.transport.post(ENDPOINT, {**binding, "op": "claim", "actionId": action_id}, PULL_TIMEOUT)
            except Exception:
                return self.result("claim_outcome_unknown")
            if status != 200:
                return self.result("endpoint_unavailable" if status == 404 else "claim_rejected")
            try:
                if not self.matching(data, action_id, binding):
                    raise ValueError("binding_mismatch")
                messages = parse_messages(data)
                if len(messages) != 1 or messages[0]["actionId"] != action_id or wire_hash(messages[0]) != digest:
                    raise ValueError("payload_mismatch")
                message = messages[0]
            except Exception:
                return self.result("claim_invalid")
            row = {"actionId": action_id, "payloadHash": fingerprint(message), "wireBinding": binding,
                   "state": "received", "ackStatus": "pending", "receivedAt": stamp()}
            self.receipts.write(row)
            blocked = self.guard()
            if blocked:
                row.update(state="not_sent", finishedAt=stamp())
                self.receipts.write(row)
                return self.result(blocked, row)
            row.update(state="sending", startedAt=stamp())
            self.receipts.write(row)
            blocked = self.guard()  # Last gate before invoking the helper, after durable sending.
            if blocked:
                row.update(state="not_sent", finishedAt=stamp())
                self.receipts.write(row)
                return self.result(blocked, row)
            try:
                sent = self.sender(message["phone"], message["text"]) == 0
            except Exception:
                sent = False
            row.update(state="sent" if sent else "uncertain", finishedAt=stamp())
            self.receipts.write(row)
            return self.acknowledge(action_id, binding, row)
        except Exception:
            return self.result("local_state_error")
        finally:
            self.receipts.close()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="operation", required=True)
    inspect_parser = sub.add_parser("inspect", help="Read only selected action metadata; no local state writes")
    inspect_parser.add_argument("--action", required=True)
    for operation in ("send", "ack"):
        command = sub.add_parser(operation)
        command.add_argument("--action", required=True)
        command.add_argument("--expected-revision", required=True)
        command.add_argument("--expected-hash", required=True)
        command.add_argument("--execute", action="store_true", required=True,
                             help="Explicitly execute this selected operation; never starts the ordinary outbox")
    args = parser.parse_args(argv)
    os.umask(0o077)
    stopping = False

    def stop(_signum, _frame):
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    secret = os.environ.get("HOMIE_SECRET", "")
    if not secret:
        result = SingleOutbox.result("secret_unavailable")
    else:
        private = Path.home() / ".boom"
        worker = SingleOutbox(None if args.operation == "inspect" else TargetReceipts(private / "wa-outbox-receipts"),
                              SingleTransport(secret), Sender(Path.home() / ".openclaw/workspace/send_whatsapp.sh"),
                              lambda: hold_present(private / "wa-outbound-hold"), ordinary_unloaded, lambda: stopping)
        if args.operation == "inspect":
            result = worker.inspect(args.action)
        else:
            result = worker.run(args.operation, args.action, args.expected_revision, args.expected_hash, args.execute)
    print(json.dumps(result, ensure_ascii=True, sort_keys=True))
    return 0 if result["outcome"] in ("inspected", "ack_registered", "already_acked") else 1


if __name__ == "__main__":
    raise SystemExit(main())
