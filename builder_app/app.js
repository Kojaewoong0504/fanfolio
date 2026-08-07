const API_BASE = localStorage.getItem('fanfolio_api_base') || (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:8000/api' : 'https://fanfolio-api.onrender.com/api');
let ACCESS_TOKEN = '';
let refreshInFlight = null;
const app = document.querySelector('#app');
const editorDraftKey = 'fanfolio.artist-studio.editor-draft';
function readEditorDraft() { try { const value = JSON.parse(localStorage.getItem(editorDraftKey) || 'null'); return value && typeof value === 'object' ? value : {}; } catch { return {}; } }
function persistEditorDraft() { try { localStorage.setItem(editorDraftKey, JSON.stringify(state.editor)); } catch { /* large images or restricted storage must not block editing */ } }
const state = {
  authenticated: false, loginError: '', loginEmail: '', magicLinkRequested: false, step: 1, cardId: null, assetId: null,
  cardName: '', jobId: null, preview: null, previewImageSrc: '', signature: '', cards: [],
  form: { name: '드림 스페셜 카드 #5', artistId: 'artist_nova3', memberId: 'member_yuna', seasonName: '2025 봄', templateId: 'template_signature_v1', rarity: 'R', signatureText: '항상 고마워요, 우리 함께해요!', hasVoice: true, voiceAssetId: null, issueLimit: 3000 }, insights: null, profile: null,
  catalog: null, catalogLoaded: false, apiConnected: false, catalogError: '', view: 'editor',
  editor: { tool: 'photo', side: 'front', template: 'luminous', imageSrc: '', imageName: '', imageScale: 100, imageX: 0, imageY: 0, textX: 0, textY: 0, stickerX: 0, stickerY: 0, background: '#f5efff', filter: 'clean', text: '드림스케이프 · 유나', textColor: '#ffffff', textSize: 24, sticker: 'spark', effect: 'glow', ...readEditorDraft() },
};
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));

async function editorImageFile() {
  if (!state.editor.imageSrc || !state.editor.imageSrc.startsWith('data:')) return null;
  const response = await fetch(state.editor.imageSrc);
  const blob = await response.blob();
  return new File([blob], state.editor.imageName || 'fanfolio-editor-card.png', { type: blob.type || 'image/png' });
}

function absoluteApiUrl(path) { if (!path) return ''; if (/^(https?:|blob:|data:)/.test(path)) return path; return `${API_BASE.replace(/\/api$/, '')}${path}`; }
function loginView() { const step = state.magicLinkRequested ? '<label class="field">로그인 토큰<input name="token" type="password" autocomplete="one-time-code" placeholder="이메일의 로그인 토큰" required /></label><button class="primary" type="submit">스튜디오 입장</button>' : '<label class="field">아티스트 이메일<input name="email" type="email" autocomplete="email" placeholder="artist@fanfolio.com" required /></label><button class="primary" type="submit">로그인 링크 받기</button>'; return `<main class="login-page"><div class="login-card"><p class="kicker">Fanfolio Artist Studio</p><div class="login-mark">✦</div><h1>아티스트 스튜디오 로그인</h1><p class="hint">아티스트 이메일로 받은 로그인 링크를 사용합니다.</p><form id="login-form" class="login-form">${step}</form>${state.loginError ? `<p class="login-error" role="alert">${esc(state.loginError)}</p>` : ''}</div></main>`; }

function shell(content) {
  const connectionLabel = state.apiConnected ? '● API 연결됨' : '○ API 연결 대기';
  app.innerHTML = `<div class="shell"><aside class="side"><div class="logo">Fanfolio <span>✦</span><small>아티스트 스튜디오</small></div><nav class="nav"><button class="active">⌂　스튜디오 홈</button><button>▦　카드 만들기</button><button>◇　내 카드</button><button>♡　팬 반응</button><button>⚙　설정</button></div><div class="profile"><span class="avatar">A</span><div><strong>아티스트</strong>ARTIST</div></aside><main class="workspace"><header class="top"><div><p class="kicker">Fanfolio Artist Studio</p><h1 class="title">${state.step === 1 ? '카드 만들기' : state.step === 2 ? '손글씨 추가' : state.step === 3 ? '카드 미리보기' : '검수 요청 완료'}</h1></div><div class="top-actions"><span class="save-state">${connectionLabel}</span><button class="secondary" id="session-config">세션 설정</button><button class="secondary" id="logout">로그아웃</button></div></header>${content}</main></div><div class="toast" id="toast"></div>`;
  bindCommon();
  document.querySelector('input[name="cardImage"]')?.toggleAttribute('required', !state.editor.imageSrc);
}
function ensureVoiceUploadField() {
  const form = document.querySelector('#card-form');
  if (!form || form.querySelector('#voice-file')) return;
  const issueField = form.querySelector('input[name="issueLimit"]')?.closest('.field');
  if (!issueField) return;
  const label = document.createElement('label');
  label.className = 'field';
  label.innerHTML = '보이스 파일 <input id="voice-file" type="file" accept="audio/mpeg,audio/mp4" /><span class="hint">보이스 카드를 켠 경우 MP3 또는 MP4 음성을 업로드하세요.</span>';
  issueField.before(label);
  label.querySelector('input')?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    void uploadVoiceAsset(file);
  });
}
const voiceFieldObserver = new MutationObserver(ensureVoiceUploadField);
voiceFieldObserver.observe(app, { childList: true, subtree: true });
function steps() { return `<div class="stepper"><div class="step ${state.step > 1 ? 'done' : 'current'}"><i>1</i> 기본 입력</div><div class="step-line"></div><div class="step ${state.step === 2 ? 'current' : state.step > 2 ? 'done' : ''}"><i>2</i> 손글씨</div><div class="step-line"></div><div class="step ${state.step === 3 ? 'current' : state.step > 3 ? 'done' : ''}"><i>3</i> 미리보기</div><div class="step-line"></div><div class="step ${state.step === 4 ? 'current' : ''}"><i>4</i> 검수·공개</div></div>`; }
function cardPreview(name = state.cardName || state.form.name, imageUrl = state.preview?.previewImageUrl) { const source = imageUrl || state.editor.imageSrc; const image = source ? `<img class="card-preview-image" src="${esc(imageUrl ? absoluteApiUrl(imageUrl) : source)}" alt="${esc(name)} 미리보기" />` : '<div class="card-figure"></div><div class="card-glow"></div>'; return `<div class="card-preview">${image}<div class="card-text"><strong>${esc(name || '새 특별 카드')}</strong><span>Fanfolio Special Card</span></div></div>`; }
function renderCardForm() {
  const f = state.form;
  return `${steps()}<div class="studio-grid"><div class="panel preview-panel"><h2>카드 미리보기</h2><div id="preview">${cardPreview()}</div><span class="hint">권장 이미지 1000×1500px · JPG/PNG</span></div><form class="panel form-panel" id="card-form"><h2>카드 정보</h2><label class="field">카드 이미지 *<input name="cardImage" type="file" accept="image/png,image/jpeg,image/webp" required /></label><label class="field">카드명 *<input name="name" placeholder="카드 이름을 입력하세요" required value="${esc(f.name)}" /></label><div class="row"><label class="field">그룹<select name="group"><option value="artist_nova3">드림스케이프</option></select></label><label class="field">멤버<select name="memberId"><option value="member_yuna" ${f.memberId === 'member_yuna' ? 'selected' : ''}>유나</option><option value="member_minho" ${f.memberId === 'member_minho' ? 'selected' : ''}>민호</option><option value="member_jei" ${f.memberId === 'member_jei' ? 'selected' : ''}>제이</option></select></label></div><div class="row"><label class="field">시즌<select name="seasonName"><option ${f.seasonName === '2025 봄' ? 'selected' : ''}>2025 봄</option><option ${f.seasonName === '2025 여름' ? 'selected' : ''}>2025 여름</option></select></label><label class="field">카드 타입<select name="templateId"><option value="template_signature_v1" ${f.templateId === 'template_signature_v1' ? 'selected' : ''}>스페셜</option><option value="template_basic_v1" ${f.templateId === 'template_basic_v1' ? 'selected' : ''}>일반</option></select></label></div><label class="field">희귀도<select name="rarity"><option value="R" ${f.rarity === 'R' ? 'selected' : ''}>R (레어)</option><option value="SR" ${f.rarity === 'SR' ? 'selected' : ''}>SR (슈퍼 레어)</option><option value="N" ${f.rarity === 'N' ? 'selected' : ''}>N (노멀)</option></select></label><label class="field">사인 메시지<textarea name="signatureText" maxlength="200" placeholder="팬에게 전하고 싶은 메시지를 입력하세요">${esc(f.signatureText)}</textarea><span class="hint">최대 200자 · 다음 단계에서 직접 손글씨를 추가할 수 있어요.</span></label><div class="toggle-row"><span>보이스 카드 <small class="hint">카드 수집 시 음성이 재생됩니다.</small></span><button type="button" class="toggle ${f.hasVoice ? 'on' : ''}" aria-label="보이스 카드 켜기" aria-pressed="${f.hasVoice}"></button></div><label class="field">발행 수량<input name="issueLimit" type="number" value="${esc(f.issueLimit)}" min="1" required /><span class="hint">발행 수량은 검수 전까지 수정할 수 있습니다.</span></label><div class="bottom-actions"><button type="button" class="secondary" id="save-draft">임시 저장</button><button class="primary" type="submit">다음: 손글씨</button></div></form></div>`;
}
function handwritingForm() { return `${steps()}<div class="handwriting-layout"><div class="panel"><h2>손글씨를 추가해 보세요</h2><p class="hint">직접 쓰거나 손글씨 이미지를 업로드하면 카드에 자연스럽게 합성됩니다.</p><div class="pad"><canvas id="signature-pad" width="760" height="420" aria-label="손글씨 입력 영역"></canvas><div class="pad-tools"><button class="secondary" id="clear-pad">지우기</button><span class="hint">손가락 또는 마우스로 작성</span></div></div><div style="height:12px"></div><label class="secondary" style="display:block;text-align:center">손글씨 이미지 업로드<input id="signature-file" type="file" accept="image/png,image/jpeg" hidden /></label><div style="height:12px"></div><button class="primary" id="remove-bg">배경 제거 요청</button><div id="job-area"></div></div><div class="panel"><h2>투명 손글씨 미리보기</h2><div class="handwriting-result" id="signature-result">${state.signature ? `<img src="${esc(state.signature)}" alt="입력한 손글씨 미리보기" />` : '<span class="hint">손글씨를 입력하면 여기에 표시됩니다.</span>'}</div><div style="height:15px"></div><div class="notice">배경 제거는 이미지 처리 작업으로 진행됩니다. 요청 후 결과가 준비되면 투명 PNG로 카드에 배치할 수 있습니다.</div><div class="bottom-actions" style="margin-top:18px"><button class="secondary" id="back-card">이전</button><button class="primary" id="next-review">다음: 미리보기</button></div></div></div>`; }
function review() { const metadata = state.preview?.metadata || {}; return `${steps()}<div class="review"><div class="panel preview-panel"><h2>검수 카드</h2>${cardPreview(metadata.name || state.cardName, state.previewImageSrc)}<span class="badge">특별 카드 · ${esc(metadata.rarity || state.form.rarity)}</span></div><div class="panel"><h2>공개 전 확인</h2><div class="checklist"><div class="check"><span>카드 정보 확인</span><span class="ok">확인 완료 ✓</span></div><div class="check"><span>이미지 및 메시지 확인</span><span class="ok">확인 완료 ✓</span></div><div class="check"><span>보이스 파일 확인</span><span class="ok">${metadata.hasVoice ? '확인 완료 ✓' : '사용 안 함'}</span></div><div class="check"><span>발행 수량 확인</span><span class="ok">${esc(metadata.issueLimit || state.form.issueLimit)}장</span></div></div><div style="height:18px"></div><label class="field"><span>검수 메모</span><textarea id="review-note" maxlength="500" placeholder="운영팀에 전달할 메모가 있나요?"></textarea></label><div class="notice" style="margin-top:15px">검수 요청 후 운영팀 확인을 거쳐 공개됩니다. 공개 전에는 언제든 임시 저장 카드에서 수정할 수 있습니다.</div><div class="bottom-actions" style="margin-top:18px"><button class="secondary" id="back-signature">이전</button><button class="primary" id="submit-review">검수 요청하기</button></div></div></div>`; }
function complete() { return `${steps()}<div class="panel complete"><div class="complete-icon">✓</div><h2>검수 요청을 보냈어요</h2><p class="hint">운영팀 확인이 완료되면 카드가 공개됩니다.</p><div style="height:18px"></div><button class="primary" id="studio-home">스튜디오 홈으로 이동</button></div>`; }
function render() { if (!state.authenticated) { app.innerHTML = loginView(); document.querySelector('#login-form')?.addEventListener('submit', loginArtist); return; } if (state.step === 1) shell(cardForm()); if (state.step === 2) shell(handwritingForm()); if (state.step === 3) shell(review()); if (state.step === 4) shell(complete()); if (state.step === 2) initCanvas(); }
function toast(message) { const el = document.querySelector('#toast'); if (!el) return; el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2500); }
async function refreshAccessToken() { if (refreshInFlight) return refreshInFlight; refreshInFlight = fetch(`${API_BASE}/auth/refresh`, { method: 'POST', credentials: 'include', headers: { 'X-Fanfolio-Client': 'artist' } }).then(async (response) => { if (!response.ok) throw new Error(`REFRESH ${response.status}`); const body = await response.json(); ACCESS_TOKEN = body.data.accessToken; return ACCESS_TOKEN; }).finally(() => { refreshInFlight = null; }); return refreshInFlight; }
async function api(path, options = {}, allowRefresh = true) { const response = await fetch(`${API_BASE}${path}`, { ...options, credentials: 'include', headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), 'X-Fanfolio-Client': 'artist', ...(ACCESS_TOKEN ? { Authorization: `Bearer ${ACCESS_TOKEN}` } : {}), ...(options.headers || {}) } }); if (response.status === 401 && allowRefresh && !path.startsWith('/auth/')) { try { await refreshAccessToken(); return api(path, options, false); } catch { ACCESS_TOKEN = ''; } } if (!response.ok) { const error = new Error(`API ${response.status}`); error.status = response.status; throw error; } return response.status === 204 ? null : response.json(); }
async function loginArtist(event) { event.preventDefault(); const form = new FormData(event.currentTarget); if (!state.magicLinkRequested) { const email = form.get('email')?.toString().trim(); if (!email) return; state.loginEmail = email; ACCESS_TOKEN = ''; try { await api('/auth/magic-link/request', { method: 'POST', body: JSON.stringify({ email, purpose: 'login' }) }); state.magicLinkRequested = true; state.loginError = `${email}로 로그인 링크를 보냈습니다.`; } catch { state.loginError = '로그인 링크를 보내지 못했습니다. 이메일과 API 상태를 확인해 주세요.'; } render(); return; } const token = form.get('token')?.toString().trim(); if (!token) return; try { const loginResult = await api('/auth/magic-link/verify', { method: 'POST', body: JSON.stringify({ token }) }); ACCESS_TOKEN = loginResult.data.accessToken; const result = await api('/artist/cards'); state.cards = result.data.items; state.authenticated = true; state.loginError = ''; render(); } catch (error) { ACCESS_TOKEN = ''; state.authenticated = false; state.loginError = error.status === 403 ? '아티스트 계정만 스튜디오에 입장할 수 있어요.' : '유효하지 않거나 만료된 로그인 링크입니다.'; render(); } }
async function loadStudio() { try { const result = await api('/artist/cards'); state.cards = result.data.items; } catch (error) { if (error.status === 401 || error.status === 403) { ACCESS_TOKEN = ''; state.authenticated = false; state.loginError = error.status === 403 ? '아티스트 계정만 스튜디오에 입장할 수 있어요.' : '세션이 만료됐어요. 다시 로그인해 주세요.'; render(); } } }
function bindCommon() { document.querySelector('#studio-home')?.addEventListener('click', () => { state.step = 1; state.preview = null; render(); }); document.querySelector('#logout')?.addEventListener('click', logoutArtist); document.querySelector('#session-config')?.addEventListener('click', () => toast('로그인 토큰은 보안을 위해 브라우저 메모리에만 보관됩니다.')); document.querySelector('.toggle')?.addEventListener('click', (event) => { state.form.hasVoice = !state.form.hasVoice; event.currentTarget.classList.toggle('on', state.form.hasVoice); event.currentTarget.setAttribute('aria-pressed', String(state.form.hasVoice)); }); }
async function logoutArtist() { try { await api('/auth/logout', { method: 'POST' }); } catch { /* 세션이 이미 만료된 경우에도 로컬 상태는 정리한다. */ } try { localStorage.removeItem(editorDraftKey); } catch { /* optional draft cleanup */ } ACCESS_TOKEN = ''; state.authenticated = false; state.loginError = ''; render(); }
function initCanvas() { const canvas = document.querySelector('#signature-pad'); const context = canvas.getContext('2d'); context.strokeStyle = '#29234f'; context.lineWidth = 5; context.lineCap = 'round'; let drawing = false; const point = (event) => { const box = canvas.getBoundingClientRect(); return { x: (event.clientX - box.left) * canvas.width / box.width, y: (event.clientY - box.top) * canvas.height / box.height }; }; canvas.addEventListener('pointerdown', (event) => { drawing = true; canvas.setPointerCapture?.(event.pointerId); const p = point(event); context.beginPath(); context.moveTo(p.x, p.y); }); canvas.addEventListener('pointermove', (event) => { if (!drawing) return; const p = point(event); context.lineTo(p.x, p.y); context.stroke(); updateSignature(); }); canvas.addEventListener('pointerup', () => { drawing = false; }); document.querySelector('#clear-pad').addEventListener('click', () => { context.clearRect(0, 0, canvas.width, canvas.height); state.signature = ''; updateSignature(); }); document.querySelector('#signature-file').addEventListener('change', (event) => { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { const image = new Image(); image.onload = () => { context.clearRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 80, 60, 600, 300); updateSignature(); }; image.src = reader.result; }; reader.readAsDataURL(file); }); document.querySelector('#remove-bg').addEventListener('click', requestBackgroundRemoval); document.querySelector('#back-card').addEventListener('click', () => { state.step = 1; render(); }); document.querySelector('#next-review').addEventListener('click', loadPreview); }
function updateSignature() { const canvas = document.querySelector('#signature-pad'); state.signature = canvas.toDataURL('image/png'); document.querySelector('#signature-result').innerHTML = `<img src="${esc(state.signature)}" alt="입력한 손글씨 미리보기" />`; }
async function uploadAsset(file, purpose) { if (!(file instanceof File) || file.size === 0) file = await editorImageFile(); if (!file) throw new Error('UPLOAD_FILE_REQUIRED'); const presigned = await api('/uploads/presign', { method: 'POST', body: JSON.stringify({ fileName: file.name, contentType: file.type, purpose }) }); const directUpload = presigned.data.uploadMode === 'direct'; const upload = await fetch(absoluteApiUrl(presigned.data.uploadUrl), { method: 'PUT', body: file, credentials: directUpload ? 'omit' : 'include', headers: { 'Content-Type': file.type, ...(directUpload ? {} : { 'X-Fanfolio-Client': 'artist', ...(ACCESS_TOKEN ? { Authorization: `Bearer ${ACCESS_TOKEN}` } : {}) }) } }); if (!upload.ok) throw new Error(`UPLOAD ${upload.status}`); if (presigned.data.completeUrl) await api(presigned.data.completeUrl.replace(/^\/api/, ''), { method: 'POST' }); return presigned.data.assetId; }
async function uploadVoiceAsset(file) { try { state.form.voiceAssetId = await uploadAsset(file, 'voice'); toast('보이스 파일을 업로드했습니다. 카드를 저장하면 연결됩니다.'); if (state.cardId) await api(`/artist/cards/${state.cardId}`, { method: 'PATCH', body: JSON.stringify({ voiceAssetId: state.form.voiceAssetId, hasVoice: true }) }); } catch { toast('보이스 파일 업로드에 실패했습니다. MP3 또는 MP4를 확인해 주세요.'); } }
async function requestBackgroundRemoval() { const area = document.querySelector('#job-area'); area.innerHTML = '<div class="job"><span class="spinner"></span> 손글씨를 업로드하고 배경 제거를 요청하는 중...</div>'; try { const blob = await new Promise((resolve) => document.querySelector('#signature-pad').toBlob(resolve, 'image/png')); state.assetId = await uploadAsset(new File([blob], 'handwriting.png', { type: 'image/png' }), 'handwriting'); const result = await api(`/assets/${state.assetId}/background-removal`, { method: 'POST' }); state.jobId = result.data.jobId; await api(`/artist/cards/${state.cardId}`, { method: 'PATCH', body: JSON.stringify({ signatureText: state.form.signatureText, handwritingAssetId: state.assetId, handwritingTransform: { x: 68, y: 724, width: 402, rotation: -3 } }) }); area.innerHTML = `<div class="job"><span class="ok">✓</span> 작업이 등록되었습니다 · ${esc(result.data.status)}</div>`; pollBackgroundRemoval(); } catch { area.innerHTML = '<div class="notice">업로드 또는 배경 제거 요청에 실패했습니다. 아티스트 세션과 API 서버를 확인해 주세요.</div>'; } }
async function pollBackgroundRemoval() { for (let attempt = 0; attempt < 10; attempt += 1) { await new Promise((resolve) => setTimeout(resolve, 1000)); try { const result = await api(`/background-removal-jobs/${state.jobId}`); if (result.data.status === 'completed') { document.querySelector('#job-area').innerHTML = '<div class="job"><span class="ok">✓</span> 투명 손글씨가 준비되었습니다.</div>'; return; } if (result.data.status === 'failed') { document.querySelector('#job-area').innerHTML = '<div class="notice">손글씨 배경 제거에 실패했습니다. 다른 이미지를 사용해 주세요.</div>'; return; } } catch { return; } } }
async function loadPreview() { if (!state.cardId) { toast('먼저 카드 정보를 저장해 주세요.'); return; } try { const result = await api(`/artist/cards/${state.cardId}/preview`, { method: 'POST' }); state.preview = result.data; if (state.previewImageSrc) URL.revokeObjectURL(state.previewImageSrc); state.previewImageSrc = ''; if (result.data.previewImageUrl) { const image = await fetch(absoluteApiUrl(result.data.previewImageUrl), { credentials: 'include', headers: { 'X-Fanfolio-Client': 'artist', ...(ACCESS_TOKEN ? { Authorization: `Bearer ${ACCESS_TOKEN}` } : {}) } }); if (!image.ok) throw new Error(`PREVIEW_IMAGE ${image.status}`); state.previewImageSrc = URL.createObjectURL(await image.blob()); } state.step = 3; render(); } catch { toast('카드 미리보기를 불러오지 못했습니다.'); } }
document.addEventListener('change', (event) => { if (event.target.matches('select[name="group"]')) { state.form.artistId = event.target.value; state.form.memberId = ''; render(); } });
document.addEventListener('submit', async (event) => { if (event.target.id !== 'card-form') return; event.preventDefault(); const form = new FormData(event.target); const imageFile = form.get('cardImage'); state.form = { ...state.form, artistId: form.get('group'), name: form.get('name'), memberId: form.get('memberId'), seasonName: form.get('seasonName'), templateId: form.get('templateId'), rarity: form.get('rarity'), signatureText: form.get('signatureText'), issueLimit: Number(form.get('issueLimit')) }; try { const imageAssetId = await uploadAsset(imageFile, 'card'); const result = await api('/artist/cards', { method: 'POST', body: JSON.stringify({ templateId: state.form.templateId, name: state.form.name, seasonName: state.form.seasonName, rarity: state.form.rarity, imageAssetId, artistId: state.form.artistId, memberId: state.form.memberId, signatureText: state.form.signatureText, hasVoice: state.form.hasVoice, issueLimit: state.form.issueLimit }) }); state.cardId = result.data.id; state.cardName = result.data.name; state.cards = [result.data, ...state.cards.filter((card) => card.id !== result.data.id)]; toast('카드를 임시 저장했습니다.'); state.step = 2; render(); } catch { toast('카드 이미지 업로드 또는 저장에 실패했습니다. 아티스트 세션과 API 서버를 확인해 주세요.'); } });
document.addEventListener('click', async (event) => { if (event.target.id === 'save-draft') toast('카드 정보는 다음 단계로 이동할 때 API에 저장됩니다.'); if (event.target.id === 'submit-review') { if (!state.cardId) { toast('먼저 카드 정보를 저장해 주세요.'); return; } try { await api(`/artist/cards/${state.cardId}/submit-review`, { method: 'POST' }); state.step = 4; render(); } catch { toast('검수 요청에 실패했습니다. 아티스트 세션과 API 서버를 확인해 주세요.'); } } if (event.target.id === 'back-signature') { state.step = 2; render(); } });
// 카드 생성에 필요한 카탈로그와 템플릿은 API 응답만 사용합니다.
// API가 준비되지 않으면 저장 가능한 것처럼 보이는 목업 옵션을 표시하지 않습니다.
function cardForm() {
  if (!state.catalogLoaded) {
    const message = state.catalogError || '아티스트 카탈로그와 카드 템플릿을 불러오는 중입니다.';
    return `<div class="panel studio-empty"><strong>${esc(message)}</strong><span>API 연결이 완료되면 카드 제작을 시작할 수 있어요.</span></div>`;
  }
  const f = state.form;
  const catalog = state.catalog || {};
  const artists = catalog.artists || [];
  const members = catalog.members || [];
  const templates = catalog.items || [];
  const selectedArtistId = f.artistId || artists[0]?.id;
  const artistOptions = artists.map((artist) => `<option value="${esc(artist.id)}" ${artist.id === selectedArtistId ? 'selected' : ''}>${esc(artist.name)}</option>`).join('');
  const availableMembers = members.filter((member) => !selectedArtistId || member.artistId === selectedArtistId);
  const selectedMemberId = availableMembers.some((member) => member.id === f.memberId) ? f.memberId : availableMembers[0]?.id;
  const memberOptions = availableMembers.map((member) => `<option value="${esc(member.id)}" ${member.id === selectedMemberId ? 'selected' : ''}>${esc(member.name)}</option>`).join('');
  const templateOptions = templates.filter((template) => template.status !== 'archived').map((template) => `<option value="${esc(template.id)}" ${template.id === f.templateId ? 'selected' : ''}>${esc(template.name)}</option>`).join('');
  return `${steps()}<div class="studio-grid"><div class="panel preview-panel"><h2>카드 미리보기</h2><div id="preview">${cardPreview()}</div><span class="hint">권장 이미지 1000×1500px · JPG/PNG</span></div><form class="panel form-panel" id="card-form"><h2>카드 정보</h2><label class="field">카드 이미지 *<input name="cardImage" type="file" accept="image/png,image/jpeg,image/webp" required /></label><label class="field">카드명 *<input name="name" placeholder="카드 이름을 입력하세요" required value="${esc(f.name)}" /></label><div class="row"><label class="field">그룹<select name="group">${artistOptions}</select></label><label class="field">멤버<select name="memberId">${memberOptions}</select></label></div><div class="row"><label class="field">시즌<select name="seasonName"><option ${f.seasonName === '2025 봄' ? 'selected' : ''}>2025 봄</option><option ${f.seasonName === '2025 여름' ? 'selected' : ''}>2025 여름</option></select></label><label class="field">카드 타입<select name="templateId">${templateOptions}</select></label></div><label class="field">희귀도<select name="rarity"><option value="R" ${f.rarity === 'R' ? 'selected' : ''}>R (레어)</option><option value="SR" ${f.rarity === 'SR' ? 'selected' : ''}>SR (슈퍼 레어)</option><option value="N" ${f.rarity === 'N' ? 'selected' : ''}>N (노멀)</option></select></label><label class="field">사인 메시지<textarea name="signatureText" maxlength="200" placeholder="팬에게 전하고 싶은 메시지를 입력하세요">${esc(f.signatureText)}</textarea><span class="hint">최대 200자 · 다음 단계에서 직접 손글씨를 추가할 수 있어요.</span><div class="toggle-row"><span>보이스 카드 <small class="hint">카드 수집 시 음성이 재생됩니다.</small></span><button type="button" class="toggle ${f.hasVoice ? 'on' : ''}" aria-label="보이스 카드 켜기" aria-pressed="${f.hasVoice}"></button></div><label class="field">발행 수량<input name="issueLimit" type="number" value="${esc(f.issueLimit)}" min="1" required /><span class="hint">발행 수량은 검수 전까지 수정할 수 있습니다.</span></label><div class="bottom-actions"><button type="button" class="secondary" id="save-draft">임시 저장</button><button class="primary" type="submit">다음: 손글씨</button></div></form></div>`;
}

async function loadStudioWithCatalog() {
  state.catalogLoaded = false;
  state.apiConnected = false;
  state.catalogError = '';
  try {
    const [catalogResult, cardsResult] = await Promise.all([api('/artist/templates'), api('/artist/cards')]);
    state.catalog = catalogResult.data;
    state.cards = cardsResult.data.items;
    state.catalogLoaded = true;
    state.apiConnected = true;
    render();
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      ACCESS_TOKEN = '';
      state.authenticated = false;
      state.loginError = error.status === 403 ? '아티스트 계정만 스튜디오에 입장할 수 있어요.' : '세션이 만료됐어요. 다시 로그인해 주세요.';
      render();
    } else {
      state.catalogError = '아티스트 카탈로그를 불러오지 못했습니다. API 서버 상태를 확인해 주세요.';
      render();
    }
  }
}

async function loadInsights() {
  try {
    const result = await api('/artist/insights');
    state.insights = result.data;
    if (state.view === 'feedback') shell(insightsView());
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      state.view = 'create';
      state.authenticated = false;
      state.loginError = '아티스트 세션이 만료됐어요. 다시 로그인해 주세요.';
      render();
      return;
    }
    toast('팬 반응을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }
}

async function loadProfile() {
  try {
    const result = await api('/artist/profile');
    state.profile = result.data;
    if (state.view === 'settings') shell(settingsView());
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      ACCESS_TOKEN = '';
      state.authenticated = false;
      state.loginError = '아티스트 세션이 만료됐어요. 다시 로그인해 주세요.';
      render();
      return;
    }
    toast('설정을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }
}

async function loginArtistWithCatalog(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  if (!state.magicLinkRequested) {
    const email = form.get('email')?.toString().trim();
    if (!email) return;
    state.loginEmail = email;
    ACCESS_TOKEN = '';
    try {
      await api('/auth/magic-link/request', { method: 'POST', body: JSON.stringify({ email, purpose: 'login' }) });
      state.magicLinkRequested = true;
      state.loginError = `${email}로 로그인 링크를 보냈습니다.`;
    } catch {
      state.loginError = '로그인 링크를 보내지 못했습니다. 이메일과 API 상태를 확인해 주세요.';
    }
    render();
    return;
  }
  const token = form.get('token')?.toString().trim();
  if (!token) return;
  try {
    const loginResult = await api('/auth/magic-link/verify', { method: 'POST', body: JSON.stringify({ token }) });
    ACCESS_TOKEN = loginResult.data.accessToken;
    state.authenticated = true;
    state.loginError = '';
    await loadStudio();
  } catch (error) {
    ACCESS_TOKEN = '';
    state.authenticated = false;
    state.loginError = error.status === 403 ? '아티스트 계정만 스튜디오에 입장할 수 있어요.' : '유효하지 않거나 만료된 로그인 링크입니다.';
    render();
  }
}

function studioCardsView() {
  const statusLabels = { draft: '임시 저장', pending_review: '검수 중', changes_requested: '수정 요청', published: '공개', rejected: '반려' };
  const cards = state.cards.length ? state.cards.map((card) => { const editable = card.status === 'draft' || card.status === 'changes_requested'; const action = editable ? `<button class="secondary card-edit" data-card-id="${esc(card.id)}">수정</button>` : '<span class="studio-readonly">공개 후 수정 불가</span>'; return `<article class="studio-card-row"><div><strong>${esc(card.name)}</strong><span>${esc(card.seasonName || '시즌 미정')} · ${esc(card.rarity || '타입 미정')}</span></div><span class="studio-status">${esc(statusLabels[card.status] || card.status)}</span><small>${card.issueLimit ? `${esc(card.issueLimit)}장` : '발행 수량 미정'}</small>${action}</article>`; }).join('') : '<div class="studio-empty"><strong>아직 만든 카드가 없어요.</strong><span>첫 번째 특별 카드를 만들어 보세요.</span></div>';
  return `<div class="panel studio-cards-panel"><div class="studio-list-heading"><div><h2>내 카드</h2><p class="hint">작성 중인 카드와 검수 상태를 확인할 수 있어요.</p></div><button class="primary compact" id="new-card">+ 새 카드 만들기</button></div><div class="studio-card-list">${cards}</div></div>`;
}

function insightsView() {
  if (!state.insights) return '<div class="panel studio-empty"><strong>팬 반응을 불러오는 중입니다.</strong><span>카드 수집 현황을 계산하고 있어요.</span></div>';
  const { summary, items } = state.insights;
  const statusLabels = { draft: '임시 저장', pending_review: '검수 중', changes_requested: '수정 요청', published: '공개', rejected: '반려' };
  const rows = items.length ? items.map((item) => `<tr><td><strong>${esc(item.name)}</strong></td><td><span class="studio-status">${esc(statusLabels[item.status] || item.status)}</span></td><td>${item.issueLimit ? `${esc(item.issueLimit)}장` : '-'}</td><td><strong>${esc(item.redeemedCount)}명</strong></td></tr>`).join('') : '<tr><td colspan="4" class="studio-empty">아직 만든 카드가 없습니다.</td></tr>';
  return `<div class="insights-page"><div class="metrics"><div class="metric"><span class="metric-label">전체 카드</span><div class="metric-value">${summary.totalCards}</div><span class="metric-note">등록한 카드</span></div><div class="metric"><span class="metric-label">공개 카드</span><div class="metric-value">${summary.publishedCards}</div><span class="metric-note">팬에게 노출 중</span></div><div class="metric"><span class="metric-label">검수 중</span><div class="metric-value">${summary.pendingReviewCards}</div><span class="metric-note">운영팀 확인 대기</span></div><div class="metric"><span class="metric-label">전체 수집 수</span><div class="metric-value">${summary.redeemedCount}</div><span class="metric-note">팬이 등록한 카드</span></div></div><div class="panel"><h2>카드별 수집 현황</h2><p class="hint">팬이 실제로 등록한 공식 카드 수를 카드별로 확인할 수 있어요.</p><div class="table-wrap"><table class="table"><thead><tr><th>카드</th><th>상태</th><th>발행 수량</th><th>수집 수</th></tr></thead><tbody>${rows}</tbody></table></div></div></div>`;
}

function settingsView() {
  if (!state.profile) return '<div class="panel studio-empty"><strong>설정을 불러오는 중입니다.</strong><span>계정 정보를 확인하고 있어요.</span></div>';
  const profile = state.profile;
  return `<div class="settings-page"><form class="panel settings-form" id="profile-form"><div><h2>계정 설정</h2><p class="hint">스튜디오에 표시되는 아티스트 계정 정보를 관리할 수 있어요.</p></div><label class="field">이메일 주소<input value="${esc(profile.email)}" readonly /><span class="hint">로그인 이메일은 운영자 확인 후 변경할 수 있습니다.</span></label><label class="field">표시 이름<input name="nickname" value="${esc(profile.nickname || '')}" placeholder="스튜디오에 표시할 이름" required maxlength="40" /></label><label class="toggle-row" for="email-enabled"><span>운영 알림 이메일 <small class="hint">카드 검수 및 공개 상태 알림을 받습니다.</small></span><input id="email-enabled" name="emailEnabled" type="checkbox" ${profile.emailEnabled ? 'checked' : ''} /></label><div class="bottom-actions"><button class="primary" type="submit">변경사항 저장</button></div></form></div>`;
}

function editorCardMarkup() {
  const e = state.editor;
  const image = e.imageSrc ? `<img class="editor-photo" src="${esc(e.imageSrc)}" alt="카드 사진 미리보기" style="transform:translate(${e.imageX}px,${e.imageY}px) scale(${e.imageScale / 100});filter:${e.filter === 'mono' ? 'grayscale(1)' : e.filter === 'warm' ? 'saturate(1.25) sepia(.18)' : 'none'}" />` : '<div class="editor-photo-empty"><span>사진을 넣어보세요</span><small>권장 1000 × 1500 px</small></div>';
  const front = e.side === 'front';
  const sticker = e.sticker === 'none' ? '' : `<span class="editor-sticker">${e.sticker === 'heart' ? '♥' : e.sticker === 'star' ? '✦' : '✧'}</span>`;
  const textStyle = `color:${esc(e.textColor)};font-size:${e.textSize}px;transform:translate(${e.textX}px,${e.textY}px)`;
  const stickerMarkup = sticker ? sticker.replace('class="editor-sticker"', `class="editor-sticker" data-editor-layer="sticker" style="transform:translate(${e.stickerX}px,${e.stickerY}px)"`) : '';
  const photoMarkup = image.replace('class="editor-photo"', 'class="editor-photo" data-editor-layer="photo"');
  return `<div class="editor-card ${front ? 'is-front' : 'is-back'} template-${esc(e.template)} effect-${esc(e.effect)}" style="--editor-bg:${esc(e.background)}">${front ? `${photoMarkup}<div class="editor-sheen"></div><div class="editor-copy" data-editor-layer="text" style="${textStyle}">${esc(e.text)}</div>${stickerMarkup}<span class="editor-card-label">FANFOLIO · SPECIAL EDITION</span>` : '<div class="editor-back-pattern"></div><div class="editor-back-copy"><strong>FANFOLIO</strong><span>공식 디지털 포토카드</span><small>이 카드는 아티스트 스튜디오에서 승인된 기본 뒷면 템플릿입니다.</small></div>'}</div>`;
}

function editorInspector() {
  const e = state.editor;
  if (e.tool === 'photo') return `<div class="inspector-block"><p class="inspector-label">사진 소스</p><label class="upload-drop"><input id="editor-photo-input" type="file" accept="image/*" capture="environment" /><span class="upload-icon">＋</span><strong>${e.imageSrc ? '사진 바꾸기' : '사진 업로드'}</strong><small>파일을 선택하거나 모바일에서 바로 촬영하세요</small></label>${e.imageSrc ? `<p class="selected-file">${esc(e.imageName || '선택한 사진')} <button type="button" class="text-button" data-editor-action="remove-photo">삭제</button></p>` : ''}<p class="inspector-label">사진 조정</p>${editorRange('imageScale', '크기', 70, 140, 1, '%')}${editorRange('imageX', '가로 위치', -80, 80, 1, 'px')}${editorRange('imageY', '세로 위치', -100, 100, 1, 'px')}<label class="field compact-field">필터<select data-editor-field="filter"><option value="clean" ${e.filter === 'clean' ? 'selected' : ''}>선명하게</option><option value="warm" ${e.filter === 'warm' ? 'selected' : ''}>따뜻한 필름</option><option value="mono" ${e.filter === 'mono' ? 'selected' : ''}>모노크롬</option></select></label></div>`;
  if (e.tool === 'text') return `<div class="inspector-block"><p class="inspector-label">카드 문구</p><label class="field compact-field"><span>텍스트</span><textarea data-editor-field="text" maxlength="60" rows="3">${esc(e.text)}</textarea></label>${editorRange('textSize', '크기', 14, 42, 1, 'px')}<label class="field compact-field"><span>색상</span><input data-editor-field="textColor" type="color" value="${esc(e.textColor)}" /></label><p class="inspector-tip">사진 위 문구는 카드 앞면에만 표시됩니다.</p></div>`;
  if (e.tool === 'sticker') return `<div class="inspector-block"><p class="inspector-label">스티커</p><div class="choice-grid">${[['spark', '✧', '빛'], ['star', '✦', '별'], ['heart', '♥', '하트'], ['none', '—', '없음']].map(([value, icon, label]) => `<button type="button" class="choice ${e.sticker === value ? 'selected' : ''}" data-editor-value="sticker" data-value="${value}"><b>${icon}</b><span>${label}</span></button>`).join('')}</div><p class="inspector-tip">스티커는 샘플 배치이며, 다음 단계에서 정밀 위치를 조정할 수 있습니다.</p></div>`;
  if (e.tool === 'effect') return `<div class="inspector-block"><p class="inspector-label">분위기</p><div class="choice-list">${[['glow', 'Aurora Glow', '은은한 빛 번짐'], ['grain', 'Soft Grain', '필름 질감'], ['none', 'Clean', '효과 없음']].map(([value, title, desc]) => `<button type="button" class="effect-choice ${e.effect === value ? 'selected' : ''}" data-editor-value="effect" data-value="${value}"><span class="effect-dot effect-${value}"></span><span><b>${title}</b><small>${desc}</small></span><i>›</i></button>`).join('')}</div></div>`;
  return `<div class="inspector-block"><p class="inspector-label">뒷면 템플릿</p><div class="locked-template"><span class="lock-icon">⌁</span><div><strong>소속사 기본 템플릿</strong><small>뒷면 레이아웃은 운영팀이 관리합니다.</small></div></div><p class="inspector-label">색상 조합</p><div class="swatches">${['#f5efff', '#eaf8ff', '#ffeef6', '#f4f1e9'].map((color) => `<button type="button" class="swatch ${e.background === color ? 'selected' : ''}" style="background:${color}" data-editor-value="background" data-value="${color}" aria-label="배경 ${color}"></button>`).join('')}</div><p class="inspector-tip">아티스트는 기본 뒷면의 색상과 효과만 변경할 수 있습니다.</p></div>`;
}

function editorRange(key, label, min, max, step, unit) { const value = state.editor[key]; return `<label class="editor-range"><span>${label}<output>${value}${unit}</output></span><input data-editor-field="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" /></label>`; }

function visualEditorView() {
  const e = state.editor;
  const tools = [['photo', '▧', '사진'], ['text', 'T', '텍스트'], ['sticker', '✦', '스티커'], ['effect', '◌', '효과'], ['back', '▣', '뒷면']];
  return `<section class="visual-editor"><div class="editor-toolbar"><div><span class="editor-breadcrumb">카드 만들기 <b>/</b> 비주얼 에디터</span><h2>나만의 특별 카드를 디자인해 보세요</h2><p>앞면은 자유롭게 꾸미고, 뒷면은 소속사 기본 템플릿을 바탕으로 완성합니다.</p></div><div class="editor-toolbar-actions"><span class="draft-status"><i></i> 자동 저장됨</span><button class="secondary" data-editor-action="exit">나중에 계속하기</button><button class="primary" data-editor-action="details">상세 정보 입력 <span>→</span></button></div></div><div class="editor-workspace"><aside class="editor-tools" aria-label="카드 편집 도구">${tools.map(([value, icon, label]) => `<button class="editor-tool ${e.tool === value ? 'active' : ''}" data-editor-tool="${value}"><span>${icon}</span><small>${label}</small></button>`).join('')}</aside><div class="editor-stage-wrap"><div class="stage-header"><span>앞면 미리보기</span><div class="side-switch"><button class="${e.side === 'front' ? 'active' : ''}" data-editor-side="front">앞면</button><button class="${e.side === 'back' ? 'active' : ''}" data-editor-side="back">뒷면</button></div><span class="zoom-label">100%</span></div><div class="visual-editor-stage"><div class="stage-grid"></div>${editorCardMarkup()}<span class="stage-caption">드래그하여 위치를 조정할 수 있어요</span></div><div class="stage-footer"><span><b>Tip</b> 카드의 분위기를 먼저 정한 뒤 사진과 문구를 배치해 보세요.</span><button class="ghost-button" data-editor-action="preview">전체 화면 미리보기 ↗</button></div></div><aside class="editor-inspector"><div class="inspector-heading"><div><span>편집 도구</span><h3>${tools.find(([value]) => value === e.tool)?.[2] || '사진'}</h3></div><span class="inspector-count">${e.side === 'front' ? '앞면' : '뒷면'}</span></div>${editorInspector()}</aside></div></section>`;
}

function initEditorDrag() {
  const card = document.querySelector('.editor-card');
  if (!card) return;
  card.querySelectorAll('[data-editor-layer]').forEach((layer) => {
    layer.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      layer.setPointerCapture?.(event.pointerId);
      const key = layer.dataset.editorLayer;
      const startX = event.clientX;
      const startY = event.clientY;
      const xKey = `${key}X`;
      const yKey = `${key}Y`;
      const originX = Number(state.editor[xKey] || 0);
      const originY = Number(state.editor[yKey] || 0);
      const move = (moveEvent) => {
        state.editor[xKey] = Math.round(originX + moveEvent.clientX - startX);
        state.editor[yKey] = Math.round(originY + moveEvent.clientY - startY);
        const transform = `translate(${state.editor[xKey]}px,${state.editor[yKey]}px)`;
        if (key === 'photo') layer.style.transform = `${transform} scale(${state.editor.imageScale / 100})`;
        else layer.style.transform = transform;
      };
      const end = () => {
        persistEditorDraft();
        layer.removeEventListener('pointermove', move);
        layer.removeEventListener('pointerup', end);
        layer.removeEventListener('pointercancel', end);
      };
      layer.addEventListener('pointermove', move);
      layer.addEventListener('pointerup', end);
      layer.addEventListener('pointercancel', end);
    });
  });
}

function renderShell(content) {
  const view = state.view || 'create';
  const editorMode = view === 'editor';
  const title = editorMode ? '비주얼 에디터' : view === 'cards' ? '내 카드' : view === 'feedback' ? '팬 반응' : view === 'settings' ? '설정' : state.step === 1 ? '카드 만들기' : state.step === 2 ? '손글씨 추가' : state.step === 3 ? '카드 미리보기' : '검수 요청 완료';
  const connectionLabel = state.apiConnected ? '● API 연결됨' : '○ API 연결 대기';
  app.innerHTML = `<div class="shell ${editorMode ? 'editor-shell' : ''}"><aside class="side"><div class="logo">Fanfolio <span>✦</span><small>아티스트 스튜디오</small></div><nav class="nav"><button data-studio-view="home" class="${view === 'home' ? 'active' : ''}">⌂　스튜디오 홈</button><button data-studio-view="create" class="${view === 'create' || editorMode ? 'active' : ''}">▦　카드 만들기</button><button data-studio-view="cards" class="${view === 'cards' ? 'active' : ''}">◇　내 카드</button><button data-studio-view="feedback" class="${view === 'feedback' ? 'active' : ''}">♡　팬 반응</button><button data-studio-view="settings" class="${view === 'settings' ? 'active' : ''}">⚙　설정</button></nav><div class="profile"><span class="avatar">A</span><div><strong>${esc(state.profile?.nickname || '아티스트')}</strong>ARTIST</div></div></aside><main class="workspace"><header class="top ${editorMode ? 'editor-top' : ''}"><div><p class="kicker">Fanfolio Artist Studio</p><h1 class="title">${title}</h1></div><div class="top-actions"><span class="save-state">${connectionLabel}</span><button class="secondary" id="session-config">세션 설정</button><button class="secondary" id="logout">로그아웃</button></div></header>${editorMode ? visualEditorView() : content}</main></div><div class="toast" id="toast"></div>`;
  bindCommon();
  document.querySelector('input[name="cardImage"]')?.toggleAttribute('required', !state.editor.imageSrc);
  if (editorMode) initEditorDrag();
  document.querySelector('#new-card')?.addEventListener('click', () => { state.view = 'editor'; state.editingCardId = null; state.cardId = null; state.step = 1; render(); });
}

document.addEventListener('click', (event) => {
  if (!state.authenticated) return;
  const tool = event.target.closest('[data-editor-tool]');
  if (tool) { state.editor.tool = tool.dataset.editorTool; if (state.editor.tool === 'back') state.editor.side = 'back'; else if (state.editor.side === 'back' && ['photo', 'text', 'sticker'].includes(state.editor.tool)) state.editor.side = 'front'; persistEditorDraft(); render(); return; }
  const side = event.target.closest('[data-editor-side]');
  if (side) { state.editor.side = side.dataset.editorSide; state.editor.tool = state.editor.side === 'back' ? 'back' : 'photo'; persistEditorDraft(); render(); return; }
  const choice = event.target.closest('[data-editor-value]');
  if (choice) { state.editor[choice.dataset.editorValue] = choice.dataset.value; persistEditorDraft(); render(); return; }
  const action = event.target.closest('[data-editor-action]')?.dataset.editorAction;
  if (action === 'details') { state.view = 'create'; render(); return; }
  if (action === 'exit') { state.view = 'cards'; shell(studioCardsView()); return; }
  if (action === 'remove-photo') { state.editor.imageSrc = ''; state.editor.imageName = ''; persistEditorDraft(); render(); return; }
  if (action === 'preview') { toast('전체 화면 미리보기는 저장 후 카드 미리보기에서 확인할 수 있어요.'); return; }
});

document.addEventListener('change', (event) => {
  const input = event.target.closest('#editor-photo-input');
  if (input?.files?.[0]) {
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = () => { state.editor.imageSrc = reader.result; state.editor.imageName = file.name; persistEditorDraft(); render(); };
    reader.readAsDataURL(file);
  }
  const field = event.target.closest('[data-editor-field]');
  if (field && field.type !== 'range') { state.editor[field.dataset.editorField] = field.value; persistEditorDraft(); render(); }
});

document.addEventListener('input', (event) => {
  const field = event.target.closest('[data-editor-field]');
  if (!field) return;
  const key = field.dataset.editorField;
  state.editor[key] = field.type === 'range' ? Number(field.value) : field.value;
  persistEditorDraft();
  const output = field.closest('label')?.querySelector('output');
  if (output && field.type === 'range') output.textContent = `${field.value}${key === 'textSize' ? 'px' : key === 'imageScale' ? '%' : 'px'}`;
  if (key === 'text') { const copy = document.querySelector('.editor-copy'); if (copy) copy.textContent = field.value; }
  if (key === 'textColor') document.querySelector('.editor-copy')?.style.setProperty('color', field.value);
  if (['imageScale', 'imageX', 'imageY', 'filter'].includes(key)) { const image = document.querySelector('.editor-photo'); if (image) { image.style.transform = `translate(${state.editor.imageX}px,${state.editor.imageY}px) scale(${state.editor.imageScale / 100})`; image.style.filter = state.editor.filter === 'mono' ? 'grayscale(1)' : state.editor.filter === 'warm' ? 'saturate(1.25) sepia(.18)' : 'none'; } }
});

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-studio-view]');
  if (!button || !state.authenticated) return;
  const view = button.dataset.studioView;
  if (view === 'cards') { state.view = 'cards'; shell(studioCardsView()); }
  if (view === 'feedback') { state.view = 'feedback'; shell(insightsView()); void loadInsights(); }
  if (view === 'settings') { state.view = 'settings'; shell(settingsView()); void loadProfile(); }
  if (view === 'create') { state.view = 'editor'; state.editingCardId = null; state.cardId = null; state.step = 1; render(); }
  if (view === 'home') { state.view = 'create'; state.editingCardId = null; state.cardId = null; state.step = 1; render(); }
});

document.addEventListener('submit', async (event) => {
  if (event.target.id !== 'profile-form') return;
  event.preventDefault();
  const form = new FormData(event.target);
  try {
    const result = await api('/artist/profile', { method: 'PATCH', body: JSON.stringify({ nickname: form.get('nickname')?.toString().trim(), emailEnabled: form.get('emailEnabled') === 'on' }) });
    state.profile = result.data;
    shell(settingsView());
    toast('설정을 저장했습니다.');
  } catch {
    toast('설정을 저장하지 못했습니다. 입력 내용을 확인해 주세요.');
  }
}, true);

function beginCardEdit(cardId) {
  const card = state.cards.find((item) => item.id === cardId);
  if (!card) return;
  state.editingCardId = card.id;
  state.cardId = card.id;
  state.cardName = card.name;
  state.form = { ...state.form, imageAssetId: card.imageAssetId, artistId: card.artistId || state.form.artistId, name: card.name, memberId: card.memberId || '', seasonName: card.seasonName || '', templateId: card.templateId || state.form.templateId, rarity: card.rarity || state.form.rarity, signatureText: card.signatureText || '', hasVoice: Boolean(card.hasVoice), issueLimit: card.issueLimit || state.form.issueLimit };
  state.handwritingTransform = card.handwritingTransform || { x: 68, y: 724, width: 402, rotation: -3 };
  state.form.voiceAssetId = card.voiceAssetId || null;
  state.view = 'create';
  state.step = 1;
  render();
  const imageInput = document.querySelector('input[name="cardImage"]');
  if (imageInput) imageInput.required = false;
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('.card-edit');
  if (button) beginCardEdit(button.dataset.cardId);
});

document.addEventListener('submit', async (event) => {
  if (!state.editingCardId || event.target.id !== 'card-form') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const form = new FormData(event.target);
  const imageFile = form.get('cardImage');
  state.form = { ...state.form, artistId: form.get('group'), name: form.get('name'), memberId: form.get('memberId'), seasonName: form.get('seasonName'), templateId: form.get('templateId'), rarity: form.get('rarity'), signatureText: form.get('signatureText'), issueLimit: Number(form.get('issueLimit')) };
  try {
    let imageAssetId = state.form.imageAssetId;
    if (imageFile instanceof File && imageFile.size > 0) imageAssetId = await uploadAsset(imageFile, 'card');
    const result = await api(`/artist/cards/${state.editingCardId}`, { method: 'PATCH', body: JSON.stringify({ templateId: state.form.templateId, name: state.form.name, seasonName: state.form.seasonName, rarity: state.form.rarity, imageAssetId, artistId: state.form.artistId, memberId: state.form.memberId, signatureText: state.form.signatureText, hasVoice: state.form.hasVoice, issueLimit: state.form.issueLimit }) });
    state.cards = state.cards.map((card) => card.id === result.data.id ? result.data : card);
    state.form.imageAssetId = result.data.imageAssetId;
    state.cardName = result.data.name;
    toast('카드를 수정했습니다.');
    state.step = 2;
    render();
  } catch {
    toast('카드 수정에 실패했습니다. 변경 내용을 확인해 주세요.');
  }
}, true);

function renderHandwritingForm() {
  const transform = state.handwritingTransform || { x: 68, y: 724, width: 402, rotation: -3 };
  const control = (key, label, min, max, step, unit) => `<label class="transform-field">${label}<span><input data-transform="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${transform[key]}" /><output id="transform-${key}-value">${transform[key]}${unit}</output></span></label>`;
  return `${steps()}<div class="handwriting-layout"><div class="panel"><h2>손글씨를 추가해 보세요</h2><p class="hint">직접 쓰거나 손글씨 이미지를 업로드하면 카드에 자연스럽게 합성됩니다.</p><div class="pad"><canvas id="signature-pad" width="760" height="420" aria-label="손글씨 입력 영역"></canvas><div class="pad-tools"><button class="secondary" id="clear-pad">지우기</button><span class="hint">손가락 또는 마우스로 작성</span></div></div><div style="height:12px"></div><label class="secondary" style="display:block;text-align:center">손글씨 이미지 업로드<input id="signature-file" type="file" accept="image/png,image/jpeg" hidden /></label><div style="height:12px"></div><button class="primary" id="remove-bg">배경 제거 요청</button><div id="job-area"></div></div><div class="panel"><h2>손글씨 배치</h2><p class="hint">카드 미리보기 기준으로 위치와 크기를 조정할 수 있어요.</p><div class="transform-controls">${control('x', '가로 위치', 0, 1000, 1, 'px')}${control('y', '세로 위치', 0, 1500, 1, 'px')}${control('width', '크기', 100, 800, 1, 'px')}${control('rotation', '회전', -180, 180, 1, '°')}</div><button class="secondary" id="save-transform">배치 저장</button><div class="handwriting-result" id="signature-result">${state.signature ? `<img src="${esc(state.signature)}" alt="입력한 손글씨 미리보기" />` : '<span class="hint">손글씨를 입력하면 여기에 표시됩니다.</span>'}</div><div style="height:15px"></div><div class="notice">배경 제거 결과와 배치값은 카드 초안에 저장되며, 다음 단계의 미리보기에 반영됩니다.</div><div class="bottom-actions" style="margin-top:18px"><button class="secondary" id="back-card">이전</button><button class="primary" id="next-review">다음: 미리보기</button></div></div></div>`;
}

function readTransformControls() {
  const value = (key) => Number(document.querySelector(`[data-transform="${key}"]`)?.value ?? 0);
  return { x: value('x'), y: value('y'), width: value('width'), rotation: value('rotation') };
}

async function saveTransform(silent = false) {
  state.handwritingTransform = readTransformControls();
  if (!state.cardId) { if (!silent) toast('먼저 카드 정보를 저장해 주세요.'); return; }
  try {
    const result = await api(`/artist/cards/${state.cardId}`, { method: 'PATCH', body: JSON.stringify({ handwritingTransform: state.handwritingTransform }) });
    state.cards = state.cards.map((card) => card.id === result.data.id ? result.data : card);
    if (!silent) toast('손글씨 배치를 저장했습니다.');
  } catch { if (!silent) toast('손글씨 배치를 저장하지 못했습니다.'); }
}

async function handleBackgroundRemoval() {
  const area = document.querySelector('#job-area');
  area.innerHTML = '<div class="job"><span class="spinner"></span> 손글씨를 업로드하고 배경 제거를 요청하는 중...</div>';
  try {
    const blob = await new Promise((resolve) => document.querySelector('#signature-pad').toBlob(resolve, 'image/png'));
    state.assetId = await uploadAsset(new File([blob], 'handwriting.png', { type: 'image/png' }), 'handwriting');
    const result = await api(`/assets/${state.assetId}/background-removal`, { method: 'POST' });
    state.jobId = result.data.jobId;
    state.handwritingTransform = readTransformControls();
    await api(`/artist/cards/${state.cardId}`, { method: 'PATCH', body: JSON.stringify({ signatureText: state.form.signatureText, handwritingAssetId: state.assetId, handwritingTransform: state.handwritingTransform }) });
    area.innerHTML = `<div class="job"><span class="ok">✓</span> 작업이 등록되었습니다 · ${esc(result.data.status)}</div>`;
    pollBackgroundRemoval();
  } catch { area.innerHTML = '<div class="notice">업로드 또는 배경 제거 요청에 실패했습니다. 아티스트 세션과 API 서버를 확인해 주세요.</div>'; }
}

async function handleLoadPreview() {
  if (!state.cardId) { toast('먼저 카드 정보를 저장해 주세요.'); return; }
  try {
    await saveTransform(true);
    const result = await api(`/artist/cards/${state.cardId}/preview`, { method: 'POST' });
    state.preview = result.data;
    if (state.previewImageSrc) URL.revokeObjectURL(state.previewImageSrc);
    state.previewImageSrc = '';
    if (result.data.previewImageUrl) {
      const image = await fetch(absoluteApiUrl(result.data.previewImageUrl), { credentials: 'include', headers: { 'X-Fanfolio-Client': 'artist', ...(ACCESS_TOKEN ? { Authorization: `Bearer ${ACCESS_TOKEN}` } : {}) } });
      if (!image.ok) throw new Error(`PREVIEW_IMAGE ${image.status}`);
      state.previewImageSrc = URL.createObjectURL(await image.blob());
    }
    state.step = 3;
    render();
  } catch { toast('카드 미리보기를 불러오지 못했습니다.'); }
}

async function restoreArtistSession() {
  if (state.authenticated) return;
  try {
    await api('/artist/cards');
    state.authenticated = true;
    await loadStudio();
  } catch {
    // A missing or expired cookie must not leave an API-loading screen stuck.
    if (state.authenticated) {
      state.authenticated = false;
      state.catalogLoaded = false;
      state.apiConnected = false;
      render();
    }
  }
}

document.addEventListener('input', (event) => {
  const input = event.target.closest('[data-transform]');
  if (!input) return;
  state.handwritingTransform = { ...(state.handwritingTransform || {}), [input.dataset.transform]: Number(input.value) };
  const output = document.querySelector(`#transform-${input.dataset.transform}-value`);
  if (output) output.value = `${input.value}${input.dataset.transform === 'rotation' ? '°' : 'px'}`;
});
document.addEventListener('click', (event) => { if (event.target.id === 'save-transform') void saveTransform(); });

loadStudio = loadStudioWithCatalog;
loginArtist = loginArtistWithCatalog;
shell = renderShell;
handwritingForm = renderHandwritingForm;
requestBackgroundRemoval = handleBackgroundRemoval;
loadPreview = handleLoadPreview;

render();
if (state.authenticated) loadStudio();
restoreArtistSession();

async function attachVoiceToCardWhenReady() {
  if (!state.form.voiceAssetId) return;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (state.cardId) {
      try {
        await api(`/artist/cards/${state.cardId}`, { method: 'PATCH', body: JSON.stringify({ voiceAssetId: state.form.voiceAssetId, hasVoice: true }) });
      } catch { /* The existing save handler reports its own failure. */ }
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

document.addEventListener('submit', (event) => {
  if (event.target.id === 'card-form' && state.form.voiceAssetId) void attachVoiceToCardWhenReady();
});
