    // SMARTLINK GENERATOR — Casafari-style property page creator
    // ═══════════════════════════════════════════════════════════════════════════
    
    function openSmartLinkGenerator() {
        smartLinkPhotos = [];
        smartLinkPOIs = [];
        smartLinkExtracted = null;
        S.modal = { type: 'smartlink' };
        document.getElementById('modals').innerHTML = `
            <div class="modal-overlay active" id="smartlinkModal">
            <div class="modal lg" style="max-width:680px">
                <div class="modal-header" style="border-bottom-color:var(--gold)">
                    <h2 style="font-weight:300;letter-spacing:1px">🔗 SmartLink Generator</h2>
                    <button class="modal-close" onclick="closeSmartLinkModal()">×</button>
                </div>
                <div class="modal-body">
                    <p style="color:var(--text-muted);font-size:13px;margin-bottom:20px">Crea una pagina condivisibile partendo da un link o da foto. Scheda professionale BOOM con mappa e contatti.</p>
                    
                    <div style="display:flex;gap:8px;margin-bottom:24px">
                        <button class="btn btn-sm" id="slModeUrl" onclick="toggleSmartLinkMode('url')" style="flex:1">🔗 Incolla URL</button>
                        <button class="btn btn-sm btn-secondary" id="slModePhotos" onclick="toggleSmartLinkMode('photos')" style="flex:1">📸 Carica Foto</button>
                    </div>
                    
                    <div id="slUrlMode">
                        <div class="form-group">
                            <label class="form-label">URL Annuncio (Immobiliare.it, Idealista, Subito, Casafari)</label>
                            <div style="display:flex;gap:8px">
                                <input type="url" class="form-input" id="slUrl" placeholder="https://www.immobiliare.it/annunci/..." style="font-size:15px;margin:0;flex:1" oninput="validateSmartLinkUrl(this.value)">
                                <button class="btn btn-sm" id="slExtractBtn" onclick="extractFromUrl()" style="white-space:nowrap;display:none">🔍 Estrai</button>
                            </div>
                            <div id="slUrlStatus" style="margin-top:6px;font-size:11px"></div>
                        </div>
                    </div>
                    
                    <div id="slPhotosMode" style="display:none">
                        <div class="form-group">
                            <label class="form-label">Trascina o seleziona foto</label>
                            <div id="slDropzone" style="border:2px dashed var(--border);border-radius:12px;padding:40px;text-align:center;cursor:pointer;transition:all .2s" 
                                 onclick="document.getElementById('slFileInput').click()"
                                 ondragover="event.preventDefault();this.style.borderColor='var(--gold)'"
                                 ondragleave="this.style.borderColor='var(--border)'"
                                 ondrop="handleSmartLinkDrop(event)">
                                <div style="font-size:40px;margin-bottom:12px">📸</div>
                                <div style="color:var(--text-secondary)">Drop foto qui o clicca</div>
                                <div style="font-size:11px;color:var(--text-muted);margin-top:8px">Max 10 foto · JPG, PNG</div>
                            </div>
                            <input type="file" id="slFileInput" multiple accept="image/*" style="display:none" onchange="handleSmartLinkFiles(this.files)">
                        </div>
                        <div id="slPhotoPreview" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"></div>
                    </div>
                    
                    <div style="border-top:1px solid var(--border);margin-top:20px;padding-top:20px">
                        <h4 style="font-weight:400;margin-bottom:16px">📝 Dettagli</h4>
                        <div id="slExtractedPhotos" style="display:none;margin-bottom:16px">
                            <label class="form-label">📸 Foto estratte</label>
                            <div id="slExtractedPhotoGrid" style="display:flex;gap:8px;flex-wrap:wrap;overflow-x:auto;padding:4px 0"></div>
                        </div>
                        <div class="form-row">
                            <div class="form-group"><label class="form-label">Titolo *</label><input type="text" class="form-input" id="slTitle" placeholder="Bilocale luminoso Trastevere"></div>
                            <div class="form-group"><label class="form-label">€/mese *</label><input type="number" class="form-input" id="slPrice" placeholder="1200"></div>
                        </div>
                        <div class="form-row">
                            <div class="form-group"><label class="form-label">Zona</label><input type="text" class="form-input" id="slZone" placeholder="Trastevere"></div>
                            <div class="form-group"><label class="form-label">Indirizzo</label><input type="text" class="form-input" id="slAddress" placeholder="Via della Scala 15"></div>
                        </div>
                        <div class="form-row" style="grid-template-columns:1fr 1fr 1fr">
                            <div class="form-group"><label class="form-label">Camere</label><input type="number" class="form-input" id="slRooms" placeholder="2"></div>
                            <div class="form-group"><label class="form-label">Bagni</label><input type="number" class="form-input" id="slBathrooms" placeholder="1"></div>
                            <div class="form-group"><label class="form-label">mq</label><input type="number" class="form-input" id="slSize" placeholder="65"></div>
                        </div>
                        <div class="form-group"><label class="form-label">Descrizione</label><textarea class="form-textarea" id="slDescription" rows="3" placeholder="Splendido bilocale..."></textarea></div>
                        <div class="form-group"><label class="form-label">Features</label><input type="text" class="form-input" id="slFeatures" placeholder="Terrazza, AC, Lavatrice..."></div>
                        
                        <div class="form-group">
                            <label class="form-label">📍 Punti di Interesse</label>
                            <div id="slPoiList"></div>
                            <div style="display:flex;gap:8px;margin-top:8px">
                                <input type="text" class="form-input" id="slPoiName" placeholder="Metro Trastevere" style="flex:1;margin:0">
                                <input type="text" class="form-input" id="slPoiDist" placeholder="5 min" style="width:80px;margin:0">
                                <button class="btn btn-sm btn-secondary" onclick="addSmartLinkPOI()">+</button>
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">👤 Assegna a Cliente</label>
                            <select class="form-select" id="slClient">
                                <option value="">—</option>
                                ${(S.pfsClients || []).filter(c => c.stage !== 'placed').map(c => `<option value="${c.id}">${c.name} (${c.service})</option>`).join('')}
                                ${(S.clients || []).filter(c => !['completed','lost'].includes(c.stage)).map(c => `<option value="${c.id}">${c.name} (${c.service})</option>`).join('')}
                            </select>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeSmartLinkModal()">Annulla</button>
                    <button class="btn" onclick="generateSmartLink()">🔗 Genera SmartLink</button>
                </div>
            </div></div>`;
    }

    let smartLinkPhotos = [];
    let smartLinkPOIs = [];
    let smartLinkExtracted = null;

    // Dedicated close for SmartLink (doesn't nuke success modal)
    function closeSmartLinkModal() {
        const overlay = document.getElementById('smartlinkModal') || document.getElementById('smartlinkSuccessModal');
        if (overlay) { overlay.classList.remove('active'); setTimeout(() => overlay.remove(), 200); }
    }

    function toggleSmartLinkMode(mode) {
        document.getElementById('slUrlMode').style.display = mode === 'url' ? 'block' : 'none';
        document.getElementById('slPhotosMode').style.display = mode === 'photos' ? 'block' : 'none';
        document.getElementById('slModeUrl').className = mode === 'url' ? 'btn btn-sm' : 'btn btn-sm btn-secondary';
        document.getElementById('slModePhotos').className = mode === 'photos' ? 'btn btn-sm' : 'btn btn-sm btn-secondary';
    }

    function validateSmartLinkUrl(url) {
        const el = document.getElementById('slUrlStatus');
        const btn = document.getElementById('slExtractBtn');
        if (!url) { el.innerHTML = ''; if (btn) btn.style.display = 'none'; return; }
        let detected = false;
        if (url.includes('immobiliare.it')) { el.innerHTML = '<span style="color:var(--green)">✅ Immobiliare.it — clicca Estrai per compilare automaticamente</span>'; detected = true; }
        else if (url.includes('idealista.it')) { el.innerHTML = '<span style="color:var(--blue)">✅ Idealista — clicca Estrai per compilare automaticamente</span>'; detected = true; }
        else if (url.includes('subito.it')) { el.innerHTML = '<span style="color:var(--orange)">✅ Subito.it — clicca Estrai per compilare automaticamente</span>'; detected = true; }
        else if (url.includes('casafari.com')) { el.innerHTML = '<span style="color:var(--gold)">✅ Casafari — clicca Estrai per compilare automaticamente</span>'; detected = true; }
        else { el.innerHTML = '<span style="color:var(--text-muted)">Link generico — inserisci i dettagli manualmente</span>'; }
        if (btn) btn.style.display = detected ? 'inline-flex' : 'none';
    }

    // ── URL SCRAPING ENGINE ──────────────────────────────────────────
    async function extractFromUrl() {
        const url = document.getElementById('slUrl')?.value;
        if (!url) return;
        const btn = document.getElementById('slExtractBtn');
        const status = document.getElementById('slUrlStatus');
        if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Estraggo...'; }
        if (status) status.innerHTML = '<span style="color:var(--gold)">⏳ Scaricando pagina...</span>';

        try {
            // Use allorigins as CORS proxy
            const proxyUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url);
            const resp = await fetch(proxyUrl, { signal: AbortSignal.timeout(15000) });
            if (!resp.ok) throw new Error('Fetch failed: ' + resp.status);
            const html = await resp.text();
            
            let extracted = { title: '', price: '', zone: '', address: '', rooms: '', bathrooms: '', size: '', description: '', features: [], photos: [] };

            if (url.includes('immobiliare.it')) {
                extracted = parseImmobiliare(html, url);
            } else if (url.includes('idealista.it')) {
                extracted = parseIdealista(html, url);
            } else if (url.includes('subito.it')) {
                extracted = parseSubito(html, url);
            } else if (url.includes('casafari.com')) {
                extracted = parseCasafari(html, url);
            } else {
                extracted = parseGeneric(html, url);
            }

            smartLinkExtracted = extracted;
            fillSmartLinkForm(extracted);
            if (status) status.innerHTML = `<span style="color:var(--green)">✅ Estratti: ${extracted.title ? 'titolo' : ''}${extracted.price ? ', prezzo' : ''}${extracted.photos.length ? ', ' + extracted.photos.length + ' foto' : ''} — verifica e completa</span>`;
        } catch(e) {
            console.error('SmartLink extract error:', e);
            if (status) status.innerHTML = `<span style="color:var(--red)">❌ Errore estrazione: ${e.message}. Inserisci manualmente.</span>`;
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '🔍 Estrai'; }
        }
    }

    function parseImmobiliare(html, url) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const r = { title: '', price: '', zone: '', address: '', rooms: '', bathrooms: '', size: '', description: '', features: [], photos: [] };
        
        // Title
        r.title = doc.querySelector('h1')?.textContent?.trim() || 
                   doc.querySelector('[class*="title"]')?.textContent?.trim() || '';
        
        // Price - look for € pattern
        const priceMatch = html.match(/€\s*([\d.,]+)/);
        if (priceMatch) r.price = priceMatch[1].replace(/\./g, '').replace(',', '');
        // Also try JSON-LD
        const jsonLd = doc.querySelector('script[type="application/ld+json"]');
        if (jsonLd) {
            try {
                const ld = JSON.parse(jsonLd.textContent);
                if (ld.offers?.price) r.price = String(ld.offers.price);
                if (ld.name) r.title = ld.name;
                if (ld.address) {
                    r.address = [ld.address.streetAddress, ld.address.addressLocality].filter(Boolean).join(', ');
                    r.zone = ld.address.addressLocality || '';
                }
                if (ld.numberOfRooms) r.rooms = String(ld.numberOfRooms);
                if (ld.floorSize?.value) r.size = String(ld.floorSize.value);
                if (ld.description) r.description = ld.description.substring(0, 500);
                if (ld.photo) {
                    const photos = Array.isArray(ld.photo) ? ld.photo : [ld.photo];
                    r.photos = photos.map(p => typeof p === 'string' ? p : p.contentUrl || p.url).filter(Boolean).slice(0, 10);
                }
                if (ld.image) {
                    const imgs = Array.isArray(ld.image) ? ld.image : [ld.image];
                    if (!r.photos.length) r.photos = imgs.filter(i => typeof i === 'string').slice(0, 10);
                }
            } catch(e) {}
        }
        
        // Rooms/size from features
        const roomMatch = html.match(/(\d+)\s*(?:local|stanz|vani)/i);
        if (roomMatch && !r.rooms) r.rooms = roomMatch[1];
        const bathMatch = html.match(/(\d+)\s*bagn/i);
        if (bathMatch) r.bathrooms = bathMatch[1];
        const sizeMatch = html.match(/(\d+)\s*m²/);
        if (sizeMatch && !r.size) r.size = sizeMatch[1];
        
        // Description fallback
        if (!r.description) {
            const descEl = doc.querySelector('[class*="description"]') || doc.querySelector('[class*="Description"]');
            if (descEl) r.description = descEl.textContent?.trim().substring(0, 500) || '';
        }

        // Photos from img tags fallback
        if (!r.photos.length) {
            const imgs = doc.querySelectorAll('img[src*="pwm.im2"], img[src*="img2.immobiliare"], img[data-src]');
            r.photos = Array.from(imgs).map(i => i.src || i.dataset.src).filter(u => u && u.startsWith('http') && !u.includes('logo')).slice(0, 10);
        }

        // Zone from URL
        if (!r.zone) {
            const zoneMatch = url.match(/annunci\/\d+-[^/]*?-([^/]+)/);
            if (zoneMatch) r.zone = zoneMatch[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        }

        return r;
    }

    function parseIdealista(html, url) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const r = { title: '', price: '', zone: '', address: '', rooms: '', bathrooms: '', size: '', description: '', features: [], photos: [] };
        
        r.title = doc.querySelector('h1, .main-info__title-main')?.textContent?.trim() || '';
        const priceEl = doc.querySelector('.info-data-price, [class*="price"]');
        if (priceEl) { const m = priceEl.textContent.match(/([\d.,]+)/); if (m) r.price = m[1].replace(/\./g, ''); }
        
        const jsonLd = doc.querySelector('script[type="application/ld+json"]');
        if (jsonLd) {
            try {
                const ld = JSON.parse(jsonLd.textContent);
                if (ld.name) r.title = ld.name;
                if (ld.offers?.price) r.price = String(ld.offers.price);
                if (ld.address?.addressLocality) r.zone = ld.address.addressLocality;
                if (ld.address?.streetAddress) r.address = ld.address.streetAddress;
                if (ld.numberOfRooms) r.rooms = String(ld.numberOfRooms);
                if (ld.floorSize?.value) r.size = String(ld.floorSize.value);
                if (ld.description) r.description = ld.description.substring(0, 500);
                if (ld.photo) r.photos = (Array.isArray(ld.photo) ? ld.photo : [ld.photo]).map(p => typeof p === 'string' ? p : p.contentUrl || p.url).filter(Boolean).slice(0, 10);
            } catch(e) {}
        }
        
        const roomMatch = html.match(/(\d+)\s*(?:local|stanz|habitac)/i);
        if (roomMatch && !r.rooms) r.rooms = roomMatch[1];
        const bathMatch = html.match(/(\d+)\s*bagn/i);
        if (bathMatch) r.bathrooms = bathMatch[1];
        const sizeMatch = html.match(/(\d+)\s*m²/);
        if (sizeMatch && !r.size) r.size = sizeMatch[1];
        
        return r;
    }

    function parseSubito(html, url) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const r = { title: '', price: '', zone: '', address: '', rooms: '', bathrooms: '', size: '', description: '', features: [], photos: [] };
        
        r.title = doc.querySelector('h1')?.textContent?.trim() || '';
        const priceMatch = html.match(/€\s*([\d.,]+)/);
        if (priceMatch) r.price = priceMatch[1].replace(/\./g, '').replace(',', '');
        
        const descEl = doc.querySelector('[class*="description"], [class*="body"]');
        if (descEl) r.description = descEl.textContent?.trim().substring(0, 500) || '';
        
        const jsonLd = doc.querySelector('script[type="application/ld+json"]');
        if (jsonLd) {
            try {
                const ld = JSON.parse(jsonLd.textContent);
                if (ld.name) r.title = ld.name;
                if (ld.offers?.price) r.price = String(ld.offers.price);
                if (ld.image) r.photos = (Array.isArray(ld.image) ? ld.image : [ld.image]).filter(i => typeof i === 'string').slice(0, 10);
            } catch(e) {}
        }

        return r;
    }

    function parseCasafari(html, url) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const r = { title: '', price: '', zone: '', address: '', rooms: '', bathrooms: '', size: '', description: '', features: [], photos: [] };
        
        r.title = doc.querySelector('h1, [class*="title"]')?.textContent?.trim() || '';
        const priceMatch = html.match(/€\s*([\d.,]+)/);
        if (priceMatch) r.price = priceMatch[1].replace(/\./g, '').replace(',', '');
        
        const sizeMatch = html.match(/(\d+)\s*m²/);
        if (sizeMatch) r.size = sizeMatch[1];
        const roomMatch = html.match(/(\d+)\s*(?:room|local|stanz|bedroom)/i);
        if (roomMatch) r.rooms = roomMatch[1];
        const bathMatch = html.match(/(\d+)\s*(?:bath|bagn)/i);
        if (bathMatch) r.bathrooms = bathMatch[1];

        // Try JSON-LD
        const jsonLd = doc.querySelector('script[type="application/ld+json"]');
        if (jsonLd) {
            try {
                const ld = JSON.parse(jsonLd.textContent);
                if (ld.name) r.title = ld.name;
                if (ld.description) r.description = ld.description.substring(0, 500);
                if (ld.photo) r.photos = (Array.isArray(ld.photo) ? ld.photo : [ld.photo]).map(p => typeof p === 'string' ? p : p.contentUrl || p.url).filter(Boolean).slice(0, 10);
            } catch(e) {}
        }

        return r;
    }

    function parseGeneric(html, url) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const r = { title: '', price: '', zone: '', address: '', rooms: '', bathrooms: '', size: '', description: '', features: [], photos: [] };
        
        r.title = doc.querySelector('h1')?.textContent?.trim() || doc.querySelector('title')?.textContent?.trim() || '';
        const priceMatch = html.match(/€\s*([\d.,]+)/);
        if (priceMatch) r.price = priceMatch[1].replace(/\./g, '').replace(',', '');
        const sizeMatch = html.match(/(\d+)\s*m²/);
        if (sizeMatch) r.size = sizeMatch[1];
        
        const metaDesc = doc.querySelector('meta[name="description"]');
        if (metaDesc) r.description = metaDesc.content?.substring(0, 500) || '';

        const jsonLd = doc.querySelector('script[type="application/ld+json"]');
        if (jsonLd) {
            try {
                const ld = JSON.parse(jsonLd.textContent);
                if (ld.name) r.title = ld.name;
                if (ld.offers?.price) r.price = String(ld.offers.price);
                if (ld.description) r.description = ld.description.substring(0, 500);
                if (ld.image) r.photos = (Array.isArray(ld.image) ? ld.image : [ld.image]).filter(i => typeof i === 'string').slice(0, 10);
            } catch(e) {}
        }
        
        return r;
    }

    function fillSmartLinkForm(d) {
        if (d.title) document.getElementById('slTitle').value = d.title;
        if (d.price) document.getElementById('slPrice').value = d.price;
        if (d.zone) document.getElementById('slZone').value = d.zone;
        if (d.address) document.getElementById('slAddress').value = d.address;
        if (d.rooms) document.getElementById('slRooms').value = d.rooms;
        if (d.bathrooms) document.getElementById('slBathrooms').value = d.bathrooms;
        if (d.size) document.getElementById('slSize').value = d.size;
        if (d.description) document.getElementById('slDescription').value = d.description;
        if (d.features?.length) document.getElementById('slFeatures').value = d.features.join(', ');
        
        // Show extracted photos
        if (d.photos?.length) {
            const container = document.getElementById('slExtractedPhotos');
            const grid = document.getElementById('slExtractedPhotoGrid');
            if (container && grid) {
                container.style.display = 'block';
                grid.innerHTML = d.photos.map((p, i) => `
                    <div style="position:relative;width:80px;height:80px;border-radius:8px;overflow:hidden;border:2px solid var(--gold);flex-shrink:0">
                        <img src="${p}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.style.display='none'">
                        <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,.6);color:#fff;font-size:9px;text-align:center;padding:2px">${i+1}/${d.photos.length}</div>
                    </div>
                `).join('');
            }
        }
    }
    // ── END URL SCRAPING ─────────────────────────────────────────────

    function handleSmartLinkDrop(e) {
        e.preventDefault();
        const dz = document.getElementById('slDropzone');
        if (dz) { dz.style.borderColor = 'var(--border)'; dz.style.background = 'transparent'; }
        handleSmartLinkFiles(e.dataTransfer.files);
    }

    function handleSmartLinkFiles(files) {
        Array.from(files).forEach(file => {
            if (!file.type.startsWith('image/') || smartLinkPhotos.length >= 10) return;
            const reader = new FileReader();
            reader.onload = (e) => { smartLinkPhotos.push({ name: file.name, data: e.target.result }); renderSmartLinkPhotoPreview(); };
            reader.readAsDataURL(file);
        });
    }

    function renderSmartLinkPhotoPreview() {
        const el = document.getElementById('slPhotoPreview');
        if (!el) return;
        el.innerHTML = smartLinkPhotos.map((p, i) => `
            <div style="position:relative;width:72px;height:72px;border-radius:8px;overflow:hidden;border:1px solid var(--border)">
                <img src="${p.data}" style="width:100%;height:100%;object-fit:cover">
                <button style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,.7);border:none;color:#fff;width:18px;height:18px;border-radius:50%;font-size:9px;cursor:pointer" onclick="smartLinkPhotos.splice(${i},1);renderSmartLinkPhotoPreview()">×</button>
            </div>
        `).join('');
    }

    function addSmartLinkPOI() {
        const nameEl = document.getElementById('slPoiName');
        const distEl = document.getElementById('slPoiDist');
        if (!nameEl?.value) return;
        smartLinkPOIs.push({ name: nameEl.value, distance: distEl?.value || '' });
        nameEl.value = ''; if (distEl) distEl.value = '';
        const list = document.getElementById('slPoiList');
        if (list) list.innerHTML = smartLinkPOIs.map((p, i) => `
            <div style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;background:var(--bg-elevated);border-radius:6px;margin:2px;font-size:12px">
                📍 ${esc(p.name)} ${p.distance ? '· ' + esc(p.distance) : ''}
                <span style="cursor:pointer;color:var(--red)" onclick="smartLinkPOIs.splice(${i},1);addSmartLinkPOI()">×</span>
            </div>
        `).join('');
    }

    async function generateSmartLink() {
        const data = {
            url: document.getElementById('slUrl')?.value || '',
            title: document.getElementById('slTitle')?.value || 'Property',
            price: document.getElementById('slPrice')?.value || '',
            zone: document.getElementById('slZone')?.value || '',
            address: document.getElementById('slAddress')?.value || '',
            rooms: document.getElementById('slRooms')?.value || '',
            bathrooms: document.getElementById('slBathrooms')?.value || '',
            size: document.getElementById('slSize')?.value || '',
            description: document.getElementById('slDescription')?.value || '',
            features: (document.getElementById('slFeatures')?.value || '').split(',').map(f => f.trim()).filter(Boolean),
            pois: smartLinkPOIs,
            photos: smartLinkExtracted?.photos || [],
            uploadedPhotos: smartLinkPhotos.map(p => p.data),
            clientId: document.getElementById('slClient')?.value || '',
            createdAt: new Date().toISOString()
        };
        if (!data.title || !data.price) { showToast('Inserisci titolo e prezzo', 'error'); return; }
        try {
            const ref = await db.collection('smartlinks').add(data);
            const shareUrl = 'https://www.boomrome.com/s.html?id=' + ref.id;
            
            // ✅ FIX: Remove old modal first, then show success (no closeModal race condition)
            const oldModal = document.getElementById('smartlinkModal');
            if (oldModal) oldModal.remove();
            smartLinkPhotos = []; smartLinkPOIs = [];
            
            document.getElementById('modals').innerHTML = `<div class="modal-overlay active" id="smartlinkSuccessModal">
                <div class="modal" style="max-width:460px">
                    <div class="modal-header" style="border-bottom-color:var(--green)"><h2 style="font-weight:300">✅ SmartLink Creato</h2><button class="modal-close" onclick="closeSmartLinkModal()">×</button></div>
                    <div class="modal-body" style="text-align:center;padding:32px">
                        <div style="font-size:48px;margin-bottom:16px">🔗</div>
                        <h3>${esc(data.title)}</h3>
                        <p style="color:var(--text-muted);margin:8px 0 20px">${data.zone ? esc(data.zone) + ' · ' : ''}€${esc(data.price)}/m</p>
                        ${data.photos.length ? `<div style="display:flex;gap:4px;justify-content:center;margin-bottom:16px;flex-wrap:wrap">${data.photos.slice(0,4).map(p => `<img src="${p}" style="width:60px;height:60px;object-fit:cover;border-radius:8px" onerror="this.style.display='none'">`).join('')}${data.photos.length > 4 ? `<div style="width:60px;height:60px;border-radius:8px;background:var(--bg-elevated);display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--text-muted)">+${data.photos.length - 4}</div>` : ''}</div>` : ''}
                        <div style="background:var(--bg-elevated);border-radius:10px;padding:12px;display:flex;gap:8px;margin-bottom:20px">
                            <input type="text" class="form-input" value="${shareUrl}" readonly style="margin:0;flex:1;font-size:12px" id="slShareUrl">
                            <button class="btn btn-sm" onclick="navigator.clipboard.writeText('${shareUrl}');showToast('Link copiato!','success')">📋</button>
                        </div>
                        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
                            <a href="https://wa.me/?text=${encodeURIComponent(data.title + ' · €' + data.price + '/m\n' + shareUrl)}" target="_blank" class="btn btn-success btn-sm">💬 WhatsApp</a>
                            <button class="btn btn-sm" onclick="navigator.clipboard.writeText('${shareUrl}');showToast('Link copiato!','success')">📋 Copia Link</button>
                            <button class="btn btn-secondary btn-sm" onclick="closeSmartLinkModal()">Chiudi</button>
                        </div>
                    </div>
                </div></div>`;
            
        } catch(e) { showToast('Errore: ' + e.message, 'error'); }
    }

    function openBOOMCardGenerator() { openPropertyCardGenerator(); }

