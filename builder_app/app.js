const API_BASE = localStorage.getItem('fanfolio_api_base') || (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:8000/api' : 'https://fanfolio-api.onrender.com/api');
let ACCESS_TOKEN = '';
let refreshInFlight = null;
const app = document.querySelector('#app');
const editorDraftKey = 'fanfolio.artist-studio.editor-draft';
const editorHistory = { past: [], future: [] };
function readEditorDraft() { try { const value = JSON.parse(localStorage.getItem(editorDraftKey) || 'null'); if (!value || typeof value !== 'object') return {}; const { previewOpen, ...draft } = value; return draft; } catch { return {}; } }
function persistEditorDraft() { try { const { previewOpen, selectedLayer, ...draft } = state.editor; localStorage.setItem(editorDraftKey, JSON.stringify(draft)); } catch { /* large images or restricted storage must not block editing */ } }
function editorSnapshot() { const { previewOpen, selectedLayer, ...draft } = state.editor; return JSON.stringify(draft); }
function rememberEditorChange() { const snapshot = editorSnapshot(); if (editorHistory.past.at(-1) !== snapshot) editorHistory.past.push(snapshot); editorHistory.future = []; if (editorHistory.past.length > 40) editorHistory.past.shift(); }
function restoreEditorSnapshot(snapshot) { state.editor = { ...state.editor, ...JSON.parse(snapshot), previewOpen: false }; persistEditorDraft(); render(); }
function undoEditorChange() { const previous = editorHistory.past.pop(); if (!previous) return toast('되돌릴 변경 사항이 없습니다.'); editorHistory.future.push(editorSnapshot()); restoreEditorSnapshot(previous); }
function redoEditorChange() { const next = editorHistory.future.pop(); if (!next) return toast('다시 실행할 변경 사항이 없습니다.'); editorHistory.past.push(editorSnapshot()); restoreEditorSnapshot(next); }
const state = {
  authenticated: false, loginError: '', loginUsername: '', loginPassword: '', mustChangePassword: false, step: 1, cardId: null, assetId: null,
  cardName: '', jobId: null, preview: null, previewImageSrc: '', signature: '', cards: [],
  form: { name: '드림 스페셜 카드 #5', artistId: 'artist_nova3', memberId: 'member_yuna', seasonName: '2025 봄', templateId: 'template_signature_v1', rarity: 'R', signatureText: '항상 고마워요, 우리 함께해요!', hasVoice: true, voiceAssetId: null, issueLimit: 3000 }, insights: null, profile: null,
  catalog: null, catalogLoaded: false, apiConnected: false, catalogError: '', view: 'editor',
  editor: { tool: 'photo', side: 'front', template: 'luminous', backTemplateId: 'agency_back_v1', imageSrc: '', imageName: '', videoSrc: '', videoName: '', videoAssetId: null, imageScale: 100, imageX: 0, imageY: 0, textX: 0, textY: 0, stickerX: 0, stickerY: 0, zoom: 100, background: '#f5efff', filter: 'clean', text: '드림스케이프 · 유나', textColor: '#ffffff', textSize: 24, sticker: 'spark', effect: 'holographic', effectIntensity: 78, effectAngle: 135, backEffect: 'sparkle', selectedLayer: 'photo', snapToGrid: true, firstRun: true, previewOpen: false, ...readEditorDraft() },
};
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));

async function editorImageFile() {
  if (!state.editor.imageSrc || !state.editor.imageSrc.startsWith('data:')) return null;
  const response = await fetch(state.editor.imageSrc);
  const blob = await response.blob();
  return new File([blob], state.editor.imageName || 'fanfolio-editor-card.png', { type: blob.type || 'image/png' });
}

function absoluteApiUrl(path) { if (!path) return ''; if (/^(https?:|blob:|data:)/.test(path)) return path; return `${API_BASE.replace(/\/api$/, '')}${path}`; }
function loginView() { const step = state.mustChangePassword ? '<p class="login-step-title">처음 로그인하셨습니다</p><p class="hint">보안을 위해 임시 비밀번호를 새 비밀번호로 변경해 주세요.</p><label class="field">현재 비밀번호<input name="currentPassword" type="password" autocomplete="current-password" required /></label><label class="field">새 비밀번호<input name="newPassword" type="password" autocomplete="new-password" minlength="12" placeholder="12자 이상" required /></label><button class="primary" type="submit">새 비밀번호 저장</button>' : '<label class="field">스튜디오 아이디<input name="username" autocomplete="username" placeholder="artist-studio" required /></label><label class="field">비밀번호<input name="password" type="password" autocomplete="current-password" required /></label><button class="primary" type="submit">스튜디오 입장</button>'; return `<main class="login-page"><div class="login-card"><p class="kicker">Fanfolio Artist Studio</p><div class="login-mark">✦</div><h1>${state.mustChangePassword ? '새 비밀번호 설정' : '아티스트 스튜디오 로그인'}</h1>${state.mustChangePassword ? '' : '<p class="hint">운영팀에서 발급받은 아이디와 비밀번호로 입장합니다.</p>'}<form id="login-form" class="login-form">${step}</form>${state.loginError ? `<p class="login-error" role="alert">${esc(state.loginError)}</p>` : ''}</div></main>`; }

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
function render() { if (!state.authenticated || state.mustChangePassword) { app.innerHTML = loginView(); document.querySelector('#login-form')?.addEventListener('submit', loginArtist); return; } if (state.step === 1) shell(cardForm()); if (state.step === 2) shell(handwritingForm()); if (state.step === 3) shell(review()); if (state.step === 4) shell(complete()); if (state.step === 2) initCanvas(); }
function toast(message) { const el = document.querySelector('#toast'); if (!el) return; el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2500); }
async function refreshAccessToken() { if (refreshInFlight) return refreshInFlight; refreshInFlight = fetch(`${API_BASE}/auth/refresh`, { method: 'POST', credentials: 'include', headers: { 'X-Fanfolio-Client': 'artist' } }).then(async (response) => { if (!response.ok) throw new Error(`REFRESH ${response.status}`); const body = await response.json(); ACCESS_TOKEN = body.data.accessToken; return ACCESS_TOKEN; }).finally(() => { refreshInFlight = null; }); return refreshInFlight; }
async function api(path, options = {}, allowRefresh = true) { const response = await fetch(`${API_BASE}${path}`, { ...options, credentials: 'include', headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), 'X-Fanfolio-Client': 'artist', ...(ACCESS_TOKEN ? { Authorization: `Bearer ${ACCESS_TOKEN}` } : {}), ...(options.headers || {}) } }); if (response.status === 401 && allowRefresh && !path.startsWith('/auth/')) { try { await refreshAccessToken(); return api(path, options, false); } catch { ACCESS_TOKEN = ''; } } if (!response.ok) { const error = new Error(`API ${response.status}`); error.status = response.status; throw error; } return response.status === 204 ? null : response.json(); }
async function loginArtist(event) { event.preventDefault(); const form = new FormData(event.currentTarget); if (!state.magicLinkRequested) { const email = form.get('email')?.toString().trim(); if (!email) return; state.loginEmail = email; ACCESS_TOKEN = ''; try { await api('/auth/magic-link/request', { method: 'POST', body: JSON.stringify({ email, purpose: 'login' }) }); state.magicLinkRequested = true; state.loginError = `${email}로 로그인 링크를 보냈습니다.`; } catch { state.loginError = '로그인 링크를 보내지 못했습니다. 이메일과 API 상태를 확인해 주세요.'; } render(); return; } const token = form.get('token')?.toString().trim(); if (!token) return; try { const loginResult = await api('/auth/magic-link/verify', { method: 'POST', body: JSON.stringify({ token }) }); ACCESS_TOKEN = loginResult.data.accessToken; const result = await api('/artist/cards'); state.cards = result.data.items; state.authenticated = true; state.loginError = ''; render(); } catch (error) { ACCESS_TOKEN = ''; state.authenticated = false; state.loginError = error.status === 403 ? '아티스트 계정만 스튜디오에 입장할 수 있어요.' : '유효하지 않거나 만료된 로그인 링크입니다.'; render(); } }
async function loadStudio() { try { const result = await api('/artist/cards'); state.cards = result.data.items; } catch (error) { if (error.status === 401 || error.status === 403) { ACCESS_TOKEN = ''; state.authenticated = false; state.loginError = error.status === 403 ? '아티스트 계정만 스튜디오에 입장할 수 있어요.' : '세션이 만료됐어요. 다시 로그인해 주세요.'; render(); } } }
function bindCommon() { document.querySelector('#studio-home')?.addEventListener('click', () => { state.step = 1; state.preview = null; render(); }); document.querySelector('#logout')?.addEventListener('click', logoutArtist); document.querySelector('#session-config')?.addEventListener('click', () => toast('로그인 토큰은 보안을 위해 브라우저 메모리에만 보관됩니다.')); document.querySelector('.toggle')?.addEventListener('click', (event) => { state.form.hasVoice = !state.form.hasVoice; event.currentTarget.classList.toggle('on', state.form.hasVoice); event.currentTarget.setAttribute('aria-pressed', String(state.form.hasVoice)); }); }
async function logoutArtist() { try { await api('/auth/logout', { method: 'POST' }); } catch { /* 세션이 이미 만료된 경우에도 로컬 상태는 정리한다. */ } try { localStorage.removeItem(editorDraftKey); } catch { /* optional draft cleanup */ } ACCESS_TOKEN = ''; state.authenticated = false; state.mustChangePassword = false; state.loginError = ''; render(); }
function initCanvas() { const canvas = document.querySelector('#signature-pad'); const context = canvas.getContext('2d'); context.strokeStyle = '#29234f'; context.lineWidth = 5; context.lineCap = 'round'; let drawing = false; const point = (event) => { const box = canvas.getBoundingClientRect(); return { x: (event.clientX - box.left) * canvas.width / box.width, y: (event.clientY - box.top) * canvas.height / box.height }; }; canvas.addEventListener('pointerdown', (event) => { drawing = true; canvas.setPointerCapture?.(event.pointerId); const p = point(event); context.beginPath(); context.moveTo(p.x, p.y); }); canvas.addEventListener('pointermove', (event) => { if (!drawing) return; const p = point(event); context.lineTo(p.x, p.y); context.stroke(); updateSignature(); }); canvas.addEventListener('pointerup', () => { drawing = false; }); document.querySelector('#clear-pad').addEventListener('click', () => { context.clearRect(0, 0, canvas.width, canvas.height); state.signature = ''; updateSignature(); }); document.querySelector('#signature-file').addEventListener('change', (event) => { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { const image = new Image(); image.onload = () => { context.clearRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 80, 60, 600, 300); updateSignature(); }; image.src = reader.result; }; reader.readAsDataURL(file); }); document.querySelector('#remove-bg').addEventListener('click', requestBackgroundRemoval); document.querySelector('#back-card').addEventListener('click', () => { state.step = 1; render(); }); document.querySelector('#next-review').addEventListener('click', loadPreview); }
function updateSignature() { const canvas = document.querySelector('#signature-pad'); state.signature = canvas.toDataURL('image/png'); document.querySelector('#signature-result').innerHTML = `<img src="${esc(state.signature)}" alt="입력한 손글씨 미리보기" />`; }
async function uploadAsset(file, purpose) { if (!(file instanceof File) || file.size === 0) file = await editorImageFile(); if (!file) throw new Error('UPLOAD_FILE_REQUIRED'); const presigned = await api('/uploads/presign', { method: 'POST', body: JSON.stringify({ fileName: file.name, contentType: file.type, purpose }) }); const directUpload = presigned.data.uploadMode === 'direct'; const upload = await fetch(absoluteApiUrl(presigned.data.uploadUrl), { method: 'PUT', body: file, credentials: directUpload ? 'omit' : 'include', headers: { 'Content-Type': file.type, ...(directUpload ? {} : { 'X-Fanfolio-Client': 'artist', ...(ACCESS_TOKEN ? { Authorization: `Bearer ${ACCESS_TOKEN}` } : {}) }) } }); if (!upload.ok) throw new Error(`UPLOAD ${upload.status}`); if (presigned.data.completeUrl) await api(presigned.data.completeUrl.replace(/^\/api/, ''), { method: 'POST' }); return presigned.data.assetId; }
async function uploadVoiceAsset(file) { try { state.form.voiceAssetId = await uploadAsset(file, 'voice'); toast('보이스 파일을 업로드했습니다. 카드를 저장하면 연결됩니다.'); if (state.cardId) await api(`/artist/cards/${state.cardId}`, { method: 'PATCH', body: JSON.stringify({ voiceAssetId: state.form.voiceAssetId, hasVoice: true }) }); } catch { toast('보이스 파일 업로드에 실패했습니다. MP3 또는 MP4를 확인해 주세요.'); } }
async function requestBackgroundRemoval() { const area = document.querySelector('#job-area'); area.innerHTML = '<div class="job"><span class="spinner"></span> 손글씨를 업로드하고 배경 제거를 요청하는 중...</div>'; try { const blob = await new Promise((resolve) => document.querySelector('#signature-pad').toBlob(resolve, 'image/png')); state.assetId = await uploadAsset(new File([blob], 'handwriting.png', { type: 'image/png' }), 'handwriting'); const result = await api(`/assets/${state.assetId}/background-removal`, { method: 'POST' }); state.jobId = result.data.jobId; await api(`/artist/cards/${state.cardId}`, { method: 'PATCH', body: JSON.stringify({ signatureText: state.form.signatureText, handwritingAssetId: state.assetId, handwritingTransform: { x: 68, y: 724, width: 402, rotation: -3 } }) }); area.innerHTML = `<div class="job"><span class="ok">✓</span> 작업이 등록되었습니다 · ${esc(result.data.status)}</div>`; pollBackgroundRemoval(); } catch { area.innerHTML = '<div class="notice">업로드 또는 배경 제거 요청에 실패했습니다. 아티스트 세션과 API 서버를 확인해 주세요.</div>'; } }
async function pollBackgroundRemoval() { for (let attempt = 0; attempt < 10; attempt += 1) { await new Promise((resolve) => setTimeout(resolve, 1000)); try { const result = await api(`/background-removal-jobs/${state.jobId}`); if (result.data.status === 'completed') { document.querySelector('#job-area').innerHTML = '<div class="job"><span class="ok">✓</span> 투명 손글씨가 준비되었습니다.</div>'; return; } if (result.data.status === 'failed') { document.querySelector('#job-area').innerHTML = '<div class="notice">손글씨 배경 제거에 실패했습니다. 다른 이미지를 사용해 주세요.</div>'; return; } } catch { return; } } }
async function loadPreview() { if (!state.cardId) { toast('먼저 카드 정보를 저장해 주세요.'); return; } try { const result = await api(`/artist/cards/${state.cardId}/preview`, { method: 'POST' }); state.preview = result.data; if (state.previewImageSrc) URL.revokeObjectURL(state.previewImageSrc); state.previewImageSrc = ''; if (result.data.previewImageUrl) { const image = await fetch(absoluteApiUrl(result.data.previewImageUrl), { credentials: 'include', headers: { 'X-Fanfolio-Client': 'artist', ...(ACCESS_TOKEN ? { Authorization: `Bearer ${ACCESS_TOKEN}` } : {}) } }); if (!image.ok) throw new Error(`PREVIEW_IMAGE ${image.status}`); state.previewImageSrc = URL.createObjectURL(await image.blob()); } state.step = 3; render(); } catch { toast('카드 미리보기를 불러오지 못했습니다.'); } }
document.addEventListener('change', (event) => {
  if (event.target.matches('select[name="group"]')) { state.form.artistId = event.target.value; state.form.memberId = ''; render(); }
  if (event.target.matches('select[name="rarity"]')) {
    const effectByRarity = { N: 'none', R: 'foil', SR: 'holographic', UR: 'prismatic' };
    const rarity = event.target.value;
    state.form.rarity = rarity;
    state.editor.effect = effectByRarity[rarity] || state.editor.effect;
    state.editor.effectIntensity = rarity === 'UR' ? 88 : rarity === 'SR' ? 80 : rarity === 'R' ? 58 : 0;
    persistEditorDraft();
    render();
  }
});
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
  if (state.mustChangePassword) {
    const currentPassword = form.get('currentPassword')?.toString();
    const newPassword = form.get('newPassword')?.toString();
    if (!currentPassword || !newPassword) return;
    try {
      await api('/auth/artist/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
      state.mustChangePassword = false;
      state.loginError = '';
      await loadStudio();
    } catch (error) {
      state.loginError = error.status === 422 ? '새 비밀번호는 12자 이상이어야 합니다.' : '비밀번호를 변경하지 못했습니다. 현재 비밀번호를 확인해 주세요.';
      render();
    }
    return;
  }
  const username = form.get('username')?.toString().trim();
  const password = form.get('password')?.toString();
  if (!username || !password) return;
  state.loginUsername = username;
  ACCESS_TOKEN = '';
  try {
    const loginResult = await api('/auth/artist/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    ACCESS_TOKEN = loginResult.data.accessToken;
    state.mustChangePassword = Boolean(loginResult.data.mustChangePassword);
    state.authenticated = true;
    state.loginError = '';
    if (state.mustChangePassword) render();
    else await loadStudio();
  } catch (error) {
    ACCESS_TOKEN = '';
    state.authenticated = false;
    state.loginError = error.status === 403 ? '아티스트 스튜디오 전용 계정으로 로그인해 주세요.' : '아이디 또는 비밀번호가 올바르지 않습니다.';
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
  const selected = (layer) => e.selectedLayer === layer ? ' editor-layer-selected' : '';
  const image = e.imageSrc ? `<img class="editor-photo${selected('photo')}" data-editor-layer="photo" src="${esc(e.imageSrc)}" alt="카드 사진 미리보기" style="transform:translate(${e.imageX}px,${e.imageY}px) scale(${e.imageScale / 100});filter:${e.filter === 'mono' ? 'grayscale(1)' : e.filter === 'warm' ? 'saturate(1.25) sepia(.18)' : 'none'}" />` : `<div class="editor-photo-empty${selected('photo')}" data-editor-layer="photo"><span>사진을 넣어보세요</span><small>권장 1000 × 1500 px</small></div>`;
  const front = e.side === 'front';
  const activeEffect = front ? (e.effect || 'none') : (e.backEffect || 'none');
  const agencyTemplate = (state.catalog?.backTemplates || []).find((template) => template.id === e.backTemplateId);
  const backTemplateUrl = agencyTemplate?.imageUrl || (e.backTemplateId === 'agency_back_v1' ? './agency-back-template-v1.png' : '');
  const sticker = e.sticker === 'none' ? '' : `<span class="editor-sticker">${e.sticker === 'heart' ? '♥' : e.sticker === 'star' ? '✦' : '✧'}</span>`;
  const textStyle = `color:${esc(e.textColor)};font-size:${e.textSize}px;transform:translate(${e.textX}px,${e.textY}px)`;
  const stickerMarkup = sticker ? sticker.replace('class="editor-sticker"', `class="editor-sticker${selected('sticker')}" data-editor-layer="sticker" style="transform:translate(${e.stickerX}px,${e.stickerY}px)"`) : '';
  const photoMarkup = image;
  const motionAttributes = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'muted loop playsinline' : 'autoplay muted loop playsinline';
  const videoMarkup = front && e.videoSrc ? `<video class="editor-video-layer" src="${esc(e.videoSrc)}" ${motionAttributes} crossorigin="use-credentials" aria-label="카드 영상 레이어"></video>` : '';
  const backMarkup = backTemplateUrl ? `<img class="editor-back-template" src="${esc(backTemplateUrl)}" alt="소속사 기본 뒷면 템플릿" />` : '<div class="editor-back-pattern"></div>';
  return `<div class="editor-card ${front ? 'is-front' : 'is-back'} template-${esc(e.template)} effect-${esc(activeEffect)}" style="--editor-bg:${esc(e.background)};--effect-intensity:${Number(e.effectIntensity || 0) / 100};--effect-angle:${Number(e.effectAngle || 135)}deg">${front ? `${photoMarkup}${videoMarkup}<div class="editor-sheen"></div><div class="editor-copy${selected('text')}" data-editor-layer="text" style="${textStyle}">${esc(e.text)}</div>${stickerMarkup}<span class="editor-card-label">FANFOLIO · SPECIAL EDITION</span>` : `${backMarkup}<div class="editor-back-copy"><strong>FANFOLIO</strong><span>공식 디지털 포토카드</span><small>소속사가 제공한 기본 템플릿입니다. 아티스트는 색상과 효과만 조정할 수 있어요.</small></div>`}</div>`;
}

function editorLayerControls() {
  const e = state.editor;
  const layers = [['photo', '사진'], ['text', '문구'], ['sticker', '스티커']];
  const current = layers.find(([value]) => value === e.selectedLayer)?.[1] || '사진';
  return `<div class="layer-controls"><div class="layer-controls-heading"><span>레이어</span><small>선택: ${current}</small></div><div class="layer-list">${layers.map(([value, label]) => `<button type="button" class="layer-chip ${e.selectedLayer === value ? 'selected' : ''}" data-editor-layer-select="${value}">${value === 'photo' ? '▧' : value === 'text' ? 'T' : '✦'}<span>${label}</span></button>`).join('')}</div><div class="layer-actions"><button type="button" data-editor-action="align-x">가로 중앙</button><button type="button" data-editor-action="align-y">세로 중앙</button><button type="button" data-editor-action="reset-position">위치 초기화</button></div><label class="snap-toggle"><input type="checkbox" data-editor-action="toggle-snap" ${e.snapToGrid ? 'checked' : ''} /> <span>스냅 가이드</span><small>드래그 시 4px 단위</small></label></div>`;
}

function editorInspectorBody() {
  const e = state.editor;
  if (e.tool === 'photo') return `<div class="inspector-block"><p class="inspector-label">사진 소스</p><label class="upload-drop"><input id="editor-photo-input" type="file" accept="image/*" capture="environment" /><span class="upload-icon">＋</span><strong>${e.imageSrc ? '사진 바꾸기' : '사진 업로드'}</strong><small>파일을 선택하거나 모바일에서 바로 촬영하세요</small></label>${e.imageSrc ? `<p class="selected-file">${esc(e.imageName || '선택한 사진')} <button type="button" class="text-button" data-editor-action="remove-photo">삭제</button></p>` : ''}<p class="inspector-label">영상 레이어</p><label class="upload-drop compact-upload"><input id="editor-video-input" type="file" accept="video/mp4,video/webm" /><span class="upload-icon">▶</span><strong>${e.videoSrc ? '영상 바꾸기' : '짧은 영상 추가'}</strong><small>MP4/WebM · 카드 위에 반복 재생되는 영상으로 표시됩니다.</small></label>${e.videoSrc ? `<p class="selected-file">${esc(e.videoName || '선택한 영상')} <button type="button" class="text-button" data-editor-action="remove-video">삭제</button></p>` : ''}<p class="inspector-label">사진 조정</p>${editorRange('imageScale', '크기', 70, 140, 1, '%')}${editorRange('imageX', '가로 위치', -80, 80, 1, 'px')}${editorRange('imageY', '세로 위치', -100, 100, 1, 'px')}<label class="field compact-field">필터<select data-editor-field="filter"><option value="clean" ${e.filter === 'clean' ? 'selected' : ''}>선명하게</option><option value="warm" ${e.filter === 'warm' ? 'selected' : ''}>따뜻한 필름</option><option value="mono" ${e.filter === 'mono' ? 'selected' : ''}>모노크롬</option></select></label></div>`;
  if (e.tool === 'text') return `<div class="inspector-block"><p class="inspector-label">카드 문구</p><label class="field compact-field"><span>텍스트</span><textarea data-editor-field="text" maxlength="60" rows="3">${esc(e.text)}</textarea></label>${editorRange('textSize', '크기', 14, 42, 1, 'px')}${editorRange('textX', '가로 위치', -100, 100, 1, 'px')}${editorRange('textY', '세로 위치', -160, 160, 1, 'px')}<label class="field compact-field"><span>색상</span><input data-editor-field="textColor" type="color" value="${esc(e.textColor)}" /></label><p class="inspector-tip">캔버스에서 문구를 직접 드래그하거나 위치 슬라이더로 정밀 조정할 수 있어요.</p></div>`;
  if (e.tool === 'sticker') return `<div class="inspector-block"><p class="inspector-label">스티커</p><div class="choice-grid">${[['spark', '✧', '빛'], ['star', '✦', '별'], ['heart', '♥', '하트'], ['none', '—', '없음']].map(([value, icon, label]) => `<button type="button" class="choice ${e.sticker === value ? 'selected' : ''}" data-editor-value="sticker" data-value="${value}"><b>${icon}</b><span>${label}</span></button>`).join('')}</div>${editorRange('stickerX', '가로 위치', -120, 120, 1, 'px')}${editorRange('stickerY', '세로 위치', -180, 180, 1, 'px')}<p class="inspector-tip">스티커를 캔버스에서 드래그하거나 위치 슬라이더로 배치할 수 있어요.</p></div>`;
  if (e.tool === 'effect') { const effectKey = e.side === 'back' ? 'backEffect' : 'effect'; const currentEffect = e[effectKey] || 'none'; const allowed = e.side === 'back' ? ['sparkle', 'foil', 'grain', 'none'] : ['holographic', 'prismatic', 'foil', 'sparkle', 'none']; const labels = { holographic: ['Holographic', '각도에 따라 무지개빛이 움직여요'], prismatic: ['Prismatic', '프리즘처럼 색이 분산돼요'], foil: ['Metallic Foil', '금속 포일처럼 반사돼요'], sparkle: ['Sparkle', '희귀도 높은 카드의 반짝임'], grain: ['Soft Grain', '필름 질감'], none: ['Clean', '효과 없음'] }; return `<div class="inspector-block"><p class="inspector-label">${e.side === 'back' ? '뒷면 분위기' : '희귀도 마감 효과'}</p><div class="choice-list">${allowed.map((value) => [value, ...(labels[value] || [value, '템플릿 허용 효과'])]).map(([value, title, desc]) => `<button type="button" class="effect-choice ${currentEffect === value ? 'selected' : ''}" data-editor-value="${effectKey}" data-value="${value}"><span class="effect-dot effect-${value}"></span><span><b>${title}</b><small>${desc}</small></span><i>›</i></button>`).join('')}</div>${e.side === 'front' ? `${editorRange('effectIntensity', '빛의 강도', 0, 100, 1, '%')}${editorRange('effectAngle', '반사 각도', 0, 360, 1, '°')}<p class="inspector-tip">실물 포토카드의 포일·홀로그램 마감처럼 디지털 카드 위에 적용됩니다. 미리보기에서 움직임을 확인하세요.</p>` : ''}</div>`; }
  const template = selectedBackTemplate(); const allowedBackgrounds = template?.allowedBackgrounds || ['#f5efff', '#eaf8ff', '#ffeef6', '#f4f1e9']; return `<div class="inspector-block"><p class="inspector-label">뒷면 템플릿</p><div class="locked-template"><span class="lock-icon">⌁</span><div><strong>${esc(template?.name || '소속사 기본 템플릿')}</strong><small>뒷면 레이아웃은 운영팀이 관리합니다.</small></div></div><p class="inspector-label">색상 조합</p><div class="swatches">${allowedBackgrounds.map((color) => `<button type="button" class="swatch ${e.background === color ? 'selected' : ''}" style="background:${color}" data-editor-value="background" data-value="${color}" aria-label="배경 ${color}"></button>`).join('')}</div><p class="inspector-tip">아티스트는 기본 뒷면의 색상과 효과만 변경할 수 있습니다.</p></div>`;
}

function editorInspector() {
  return `${state.editor.side === 'front' ? editorLayerControls() : ''}${editorInspectorBody()}`;
}

function studioIcon(name) {
  const paths = {
    photo: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 17 4.5-4 3 2.5 2.5-2 5 4.5"/>',
    text: '<path d="M5 5h14M12 5v14M8 19h8"/>',
    sticker: '<path d="m12 3 2.1 5.9L20 11l-5.9 2.1L12 19l-2.1-5.9L4 11l5.9-2.1L12 3Z"/><path d="m19 4 .5 1.5L21 6l-1.5.5L19 8l-.5-1.5L17 6l1.5-.5L19 4Z"/>',
    effect: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2"/>',
    back: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.photo}</svg>`;
}

function selectedBackTemplate() {
  return (state.catalog?.backTemplates || []).find((template) => template.id === state.editor.backTemplateId) || null;
}

function editorRange(key, label, min, max, step, unit) { const value = state.editor[key]; return `<label class="editor-range"><span>${label}<output>${value}${unit}</output></span><input data-editor-field="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" /></label>`; }

function editorLayerPositionKeys() {
  const layer = state.editor.selectedLayer || 'photo';
  return layer === 'text' ? ['textX', 'textY'] : layer === 'sticker' ? ['stickerX', 'stickerY'] : ['imageX', 'imageY'];
}

function alignEditorLayer(axis) {
  const [xKey, yKey] = editorLayerPositionKeys();
  state.editor[axis === 'x' ? xKey : yKey] = 0;
}

function editorDesignConfig(imageAssetId) {
  const e = state.editor;
  return {
    version: 2,
    front: {
      image: { assetId: imageAssetId, x: Number(e.imageX || 0), y: Number(e.imageY || 0), scale: Number(e.imageScale || 100), filter: e.filter || 'clean' },
      text: { value: e.text || '', x: Number(e.textX || 0), y: Number(e.textY || 0), size: Number(e.textSize || 24), color: e.textColor || '#ffffff' },
      sticker: { kind: e.sticker || 'none', x: Number(e.stickerX || 0), y: Number(e.stickerY || 0) },
      effect: e.effect || 'none', effectIntensity: Number(e.effectIntensity || 0), effectAngle: Number(e.effectAngle || 135), videoAssetId: e.videoAssetId || null,
    },
    back: { templateId: e.backTemplateId || 'agency_back_v1', background: e.background || '#f5efff', effect: e.backEffect || 'none' },
  };
}

function restoreEditorDesign(card) {
  const config = card?.designConfig;
  if (!config?.front || !config?.back) return;
  const image = config.front.image || {};
  const text = config.front.text || {};
  const sticker = config.front.sticker || {};
  state.editor = {
    ...state.editor,
    imageSrc: card.imageUrl ? absoluteApiUrl(card.imageUrl) : card.imageAssetUrl || state.editor.imageSrc,
    imageName: card.name ? `${card.name}.jpg` : state.editor.imageName,
    videoSrc: card.videoUrl ? absoluteApiUrl(card.videoUrl) : state.editor.videoSrc,
    videoName: card.videoAssetId ? `${card.name || 'card'}-motion.mp4` : state.editor.videoName,
    imageScale: Number(image.scale ?? state.editor.imageScale), imageX: Number(image.x ?? state.editor.imageX), imageY: Number(image.y ?? state.editor.imageY), filter: image.filter || state.editor.filter,
    text: text.value ?? state.editor.text, textX: Number(text.x ?? state.editor.textX), textY: Number(text.y ?? state.editor.textY), textSize: Number(text.size ?? state.editor.textSize), textColor: text.color || state.editor.textColor,
    sticker: sticker.kind || state.editor.sticker, stickerX: Number(sticker.x ?? state.editor.stickerX), stickerY: Number(sticker.y ?? state.editor.stickerY), effect: config.front.effect || state.editor.effect, effectIntensity: Number(config.front.effectIntensity ?? state.editor.effectIntensity), effectAngle: Number(config.front.effectAngle ?? state.editor.effectAngle), videoAssetId: config.front.videoAssetId || state.editor.videoAssetId, backEffect: config.back.effect || state.editor.backEffect, background: config.back.background || state.editor.background,
  };
  persistEditorDraft();
}

function visualEditorView() {
  const e = state.editor;
  if (e.firstRun !== false) return editorStartView();
  const tools = [['photo', studioIcon('photo'), '사진'], ['text', studioIcon('text'), '텍스트'], ['sticker', studioIcon('sticker'), '스티커'], ['effect', studioIcon('effect'), '효과'], ['back', studioIcon('back'), '뒷면']];
  const preview = e.previewOpen ? `<div class="editor-preview-backdrop" role="presentation"><div class="editor-preview-modal" role="dialog" aria-modal="true" aria-labelledby="editor-preview-title"><div class="editor-preview-heading"><div><span>FANFOLIO · CARD PREVIEW</span><h3 id="editor-preview-title">카드 전체 화면 미리보기</h3></div><button class="modal-close" data-editor-action="close-preview" aria-label="미리보기 닫기">×</button></div><div class="editor-preview-stage"><div class="preview-side-label">${e.side === 'front' ? '앞면' : '뒷면'}</div>${editorCardMarkup()}</div><div class="editor-preview-actions"><button class="secondary" data-editor-action="close-preview">계속 편집하기</button><button class="primary" data-editor-action="details">이 디자인으로 상세 정보 입력 <span>→</span></button></div></div></div>` : '';
  return `<section class="visual-editor"><div class="editor-toolbar"><div><span class="editor-breadcrumb">카드 만들기 <b>/</b> 비주얼 에디터</span><h2>나만의 특별 카드를 디자인해 보세요</h2><p>앞면은 자유롭게 꾸미고, 뒷면은 소속사 기본 템플릿을 바탕으로 완성합니다.</p></div><div class="editor-toolbar-actions"><span class="draft-status"><i></i> 자동 저장됨</span><button class="secondary" data-editor-action="exit">나중에 계속하기</button><button class="primary" data-editor-action="details">상세 정보 입력 <span>→</span></button></div></div><div class="editor-workspace"><aside class="editor-tools" aria-label="카드 편집 도구">${tools.map(([value, icon, label]) => `<button class="editor-tool ${e.tool === value ? 'active' : ''}" data-editor-tool="${value}"><span>${icon}</span><small>${label}</small></button>`).join('')}</aside><div class="editor-stage-wrap"><div class="stage-header"><span>${e.side === 'front' ? '앞면' : '뒷면'} 미리보기</span><div class="side-switch"><button class="${e.side === 'front' ? 'active' : ''}" data-editor-side="front">앞면</button><button class="${e.side === 'back' ? 'active' : ''}" data-editor-side="back">뒷면</button></div><span class="zoom-label">100%</span></div><div class="visual-editor-stage"><div class="stage-grid"></div>${editorCardMarkup()}<span class="stage-caption">드래그하여 위치를 조정할 수 있어요</span></div><div class="stage-footer"><span><b>Tip</b> 카드의 분위기를 먼저 정한 뒤 사진과 문구를 배치해 보세요.</span><button class="ghost-button" data-editor-action="preview">전체 화면 미리보기 ↗</button></div></div><aside class="editor-inspector"><div class="inspector-heading"><div><span>편집 도구</span><h3>${tools.find(([value]) => value === e.tool)?.[2] || '사진'}</h3></div><span class="inspector-count">${e.side === 'front' ? '앞면' : '뒷면'}</span></div>${editorInspector()}</aside></div>${preview}</section>`;
}

function editorStartView() {
  const presets = [
    ['signature', '사인 포토카드', '따뜻한 사진과 손글씨 중심', 'foil', 'R', 'template_signature_v1', '✍'],
    ['holographic', '홀로그램 스페셜', '각도에 따라 무지개빛이 움직이는 카드', 'holographic', 'SR', 'template_signature_v1', '✦'],
    ['motion', '모션 컬렉터 카드', '짧은 영상을 카드 위에 겹쳐 표현', 'prismatic', 'UR', 'template_signature_v1', '▶'],
  ];
  return `<section class="editor-start"><div class="editor-start-copy"><span class="editor-breadcrumb">카드 만들기 <b>/</b> 빠른 시작</span><p class="editor-kicker">FANFOLIO CARD RECIPE</p><h2>어떤 카드부터 만들어 볼까요?</h2><p>카드의 목적을 고르면 기본 분위기와 희귀도 효과를 자동으로 준비해 드려요. 다음 화면에서 원하는 대로 세밀하게 편집할 수 있습니다.</p></div><div class="preset-grid">${presets.map(([id, title, desc, effect, rarity, template, icon]) => `<button type="button" class="preset-card preset-${id}" data-editor-preset="${id}"><span class="preset-icon">${icon}</span><span class="preset-rarity">${rarity} · ${effect === 'holographic' ? 'HOLO' : effect === 'prismatic' ? 'MOTION' : 'SIGNATURE'}</span><strong>${title}</strong><small>${desc}</small><span class="preset-arrow">시작하기&nbsp; →</span></button>`).join('')}</div><div class="editor-start-footer"><span><b>처음이라면</b> 사인 포토카드로 시작해 보세요.</span><button type="button" class="text-button" data-editor-action="skip-start">빈 캔버스로 시작</button></div></section>`;
}

function initEditorDrag() {
  const card = document.querySelector('.editor-card');
  if (!card) return;
  card.querySelectorAll('[data-editor-layer]').forEach((layer) => {
    layer.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      rememberEditorChange();
      layer.setPointerCapture?.(event.pointerId);
      const key = layer.dataset.editorLayer;
      state.editor.selectedLayer = key;
      const startX = event.clientX;
      const startY = event.clientY;
      const xKey = `${key}X`;
      const yKey = `${key}Y`;
      const originX = Number(state.editor[xKey] || 0);
      const originY = Number(state.editor[yKey] || 0);
      const move = (moveEvent) => {
        const grid = state.editor.snapToGrid && !moveEvent.shiftKey ? 4 : 1;
        state.editor[xKey] = Math.round((originX + moveEvent.clientX - startX) / grid) * grid;
        state.editor[yKey] = Math.round((originY + moveEvent.clientY - startY) / grid) * grid;
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
  app.innerHTML = `<div class="shell ${editorMode ? 'editor-shell' : ''}"><aside class="side"><div class="logo"><img class="studio-brand-icon" src="./fanfolio-app-icon.png" alt="" /><b>FANFOLIO</b><small>아티스트 스튜디오</small></div><nav class="nav"><button data-studio-view="home" class="${view === 'home' ? 'active' : ''}">⌂　스튜디오 홈</button><button data-studio-view="create" class="${view === 'create' || editorMode ? 'active' : ''}">▦　카드 만들기</button><button data-studio-view="cards" class="${view === 'cards' ? 'active' : ''}">◇　내 카드</button><button data-studio-view="feedback" class="${view === 'feedback' ? 'active' : ''}">♡　팬 반응</button><button data-studio-view="settings" class="${view === 'settings' ? 'active' : ''}">⚙　설정</button></nav><div class="profile"><span class="avatar">A</span><div><strong>${esc(state.profile?.nickname || '아티스트')}</strong>ARTIST</div></div></aside><main class="workspace"><header class="top ${editorMode ? 'editor-top' : ''}"><div><p class="kicker">Fanfolio Artist Studio</p><h1 class="title">${title}</h1></div><div class="top-actions"><span class="save-state">${connectionLabel}</span><button class="secondary" id="session-config">세션 설정</button><button class="secondary" id="logout">로그아웃</button></div></header>${editorMode ? visualEditorView() : content}</main></div><div class="toast" id="toast"></div>`;
  bindCommon();
  if (editorMode) enhanceEditorControls();
  enhanceCardImageField();
  enhanceRarityField();
  document.querySelector('input[name="cardImage"]')?.toggleAttribute('required', !state.editor.imageSrc);
  if (editorMode) initEditorDrag();
  document.querySelector('#new-card')?.addEventListener('click', () => { state.view = 'editor'; state.editingCardId = null; state.cardId = null; state.step = 1; render(); });
}

function enhanceEditorControls() {
  const draftStatus = document.querySelector('.draft-status');
  if (draftStatus) draftStatus.innerHTML = '<i></i> 이 기기에 초안 저장됨';
  const actions = document.querySelector('.editor-toolbar-actions');
  if (actions && !actions.querySelector('[data-editor-action="undo"]')) {
    actions.insertAdjacentHTML('afterbegin', '<button class="icon-action" data-editor-action="undo" aria-label="되돌리기" title="되돌리기">↶</button><button class="icon-action" data-editor-action="redo" aria-label="다시 실행" title="다시 실행">↷</button>');
  }
  const header = document.querySelector('.stage-header');
  if (header && !header.querySelector('.zoom-controls')) {
    header.insertAdjacentHTML('beforeend', `<div class="zoom-controls" aria-label="캔버스 확대 축소"><button data-editor-action="zoom-out" aria-label="축소">−</button><span class="zoom-label">${Number(state.editor.zoom || 100)}%</span><button data-editor-action="zoom-in" aria-label="확대">＋</button><button data-editor-action="zoom-reset" aria-label="확대 비율 초기화">맞춤</button></div>`);
  }
  const card = document.querySelector('.visual-editor-stage .editor-card');
  if (card) card.style.transform = `scale(${Number(state.editor.zoom || 100) / 100})`;
  document.querySelector('[data-editor-action="undo"]')?.toggleAttribute('disabled', editorHistory.past.length === 0);
  document.querySelector('[data-editor-action="redo"]')?.toggleAttribute('disabled', editorHistory.future.length === 0);
}

document.addEventListener('keydown', (event) => {
  if (!state.authenticated) return;
  const modifier = event.metaKey || event.ctrlKey;
  if (modifier && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    if (event.shiftKey) redoEditorChange(); else undoEditorChange();
  }
  if (event.key === 'Escape' && state.editor.previewOpen) {
    state.editor.previewOpen = false;
    render();
  }
});

function enhanceCardImageField() {
  const input = document.querySelector('input[name="cardImage"]');
  const field = input?.closest('.field');
  if (!field) return;
  const labelText = [...field.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
  if (labelText) labelText.textContent = state.editor.imageSrc ? '에디터 사진' : '카드 이미지 *';
  let hint = field.querySelector('.editor-image-hint');
  if (state.editor.imageSrc && !hint) {
    hint = document.createElement('span');
    hint.className = 'hint editor-image-hint';
    hint.textContent = '비주얼 에디터에서 선택한 사진이 자동으로 연결됩니다. 필요하면 여기서 교체할 수 있어요.';
    field.append(hint);
  }
}

function enhanceRarityField() {
  const select = document.querySelector('select[name="rarity"]');
  if (!select || select.querySelector('option[value="UR"]')) return;
  const option = document.createElement('option');
  option.value = 'UR';
  option.textContent = 'UR (울트라 레어)';
  select.insertBefore(option, select.querySelector('option[value="N"]') || null);
  if (state.form.rarity === 'UR') select.value = 'UR';
}

document.addEventListener('click', (event) => {
  if (!state.authenticated) return;
  const layerSelect = event.target.closest('[data-editor-layer-select]');
  if (layerSelect) { state.editor.selectedLayer = layerSelect.dataset.editorLayerSelect; state.editor.tool = state.editor.selectedLayer === 'text' ? 'text' : state.editor.selectedLayer === 'sticker' ? 'sticker' : 'photo'; render(); return; }
  const tool = event.target.closest('[data-editor-tool]');
  if (tool) { rememberEditorChange(); state.editor.tool = tool.dataset.editorTool; if (state.editor.tool === 'back') state.editor.side = 'back'; else if (state.editor.side === 'back' && ['photo', 'text', 'sticker'].includes(state.editor.tool)) state.editor.side = 'front'; persistEditorDraft(); render(); return; }
  const side = event.target.closest('[data-editor-side]');
  if (side) { rememberEditorChange(); state.editor.side = side.dataset.editorSide; state.editor.tool = state.editor.side === 'back' ? 'back' : 'photo'; persistEditorDraft(); render(); return; }
  const choice = event.target.closest('[data-editor-value]');
  if (choice) { rememberEditorChange(); state.editor[choice.dataset.editorValue] = choice.dataset.value; persistEditorDraft(); render(); return; }
  const action = event.target.closest('[data-editor-action]')?.dataset.editorAction;
  const preset = event.target.closest('[data-editor-preset]')?.dataset.editorPreset;
  if (preset) {
    rememberEditorChange();
    const presets = {
      signature: { effect: 'foil', rarity: 'R', intensity: 58, text: '드림스케이프 · 유나' },
      holographic: { effect: 'holographic', rarity: 'SR', intensity: 82, text: 'SPECIAL HOLOGRAPHIC' },
      motion: { effect: 'prismatic', rarity: 'UR', intensity: 76, text: 'MOTION COLLECTOR' },
    };
    const selected = presets[preset] || presets.signature;
    state.editor = { ...state.editor, firstRun: false, effect: selected.effect, effectIntensity: selected.intensity, text: selected.text };
    state.form.rarity = selected.rarity;
    persistEditorDraft();
    render();
    return;
  }
  if (action === 'skip-start') { rememberEditorChange(); state.editor.firstRun = false; persistEditorDraft(); render(); return; }
  if (action === 'undo') { undoEditorChange(); return; }
  if (action === 'redo') { redoEditorChange(); return; }
  if (action === 'align-x' || action === 'align-y') { rememberEditorChange(); alignEditorLayer(action === 'align-x' ? 'x' : 'y'); persistEditorDraft(); render(); return; }
  if (action === 'reset-position') { rememberEditorChange(); const [xKey, yKey] = editorLayerPositionKeys(); state.editor[xKey] = 0; state.editor[yKey] = 0; persistEditorDraft(); render(); return; }
  if (action === 'toggle-snap') { state.editor.snapToGrid = event.target.checked; persistEditorDraft(); return; }
  if (action === 'zoom-in' || action === 'zoom-out' || action === 'zoom-reset') {
    rememberEditorChange();
    const current = Number(state.editor.zoom || 100);
    state.editor.zoom = action === 'zoom-reset' ? 100 : Math.max(70, Math.min(140, current + (action === 'zoom-in' ? 10 : -10)));
    persistEditorDraft();
    render();
    return;
  }
  if (action === 'details') { state.view = 'create'; render(); return; }
  if (action === 'exit') { state.view = 'cards'; shell(studioCardsView()); return; }
  if (action === 'remove-photo') { state.editor.imageSrc = ''; state.editor.imageName = ''; persistEditorDraft(); render(); return; }
  if (action === 'remove-video') { state.editor.videoSrc = ''; state.editor.videoName = ''; state.editor.videoAssetId = null; persistEditorDraft(); render(); return; }
  if (action === 'preview') { state.editor.previewOpen = true; render(); return; }
  if (action === 'close-preview') { state.editor.previewOpen = false; render(); return; }
});

document.addEventListener('change', (event) => {
  const input = event.target.closest('#editor-photo-input');
  if (input?.files?.[0]) {
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = () => { state.editor.imageSrc = reader.result; state.editor.imageName = file.name; persistEditorDraft(); render(); };
    reader.readAsDataURL(file);
  }
  const videoInput = event.target.closest('#editor-video-input');
  if (videoInput?.files?.[0]) {
    const file = videoInput.files[0];
    if (!['video/mp4', 'video/webm'].includes(file.type)) { toast('MP4 또는 WebM 영상만 사용할 수 있어요.'); return; }
    state.editor.videoName = file.name;
    state.editor.videoSrc = URL.createObjectURL(file);
    persistEditorDraft();
    void uploadAsset(file, 'video').then(async (assetId) => { state.editor.videoAssetId = assetId; persistEditorDraft(); if (state.cardId) await api(`/artist/cards/${state.cardId}`, { method: 'PATCH', body: JSON.stringify({ videoAssetId: assetId, designConfig: editorDesignConfig(state.form.imageAssetId) }) }); toast('영상 레이어를 업로드했습니다.'); }).catch(() => toast('영상 업로드에 실패했습니다.'));
    render();
  }
  const field = event.target.closest('[data-editor-field]');
  if (field && field.type !== 'range') { rememberEditorChange(); state.editor[field.dataset.editorField] = field.value; persistEditorDraft(); render(); }
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

document.addEventListener('pointerdown', (event) => {
  const field = event.target.closest('[data-editor-field]');
  if (field?.type === 'range') rememberEditorChange();
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
  restoreEditorDesign(card);
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
  if (event.target.id !== 'card-form') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const form = new FormData(event.target);
  const imageFile = form.get('cardImage');
  const editing = Boolean(state.editingCardId);
  state.form = { ...state.form, artistId: form.get('group'), name: form.get('name'), memberId: form.get('memberId'), seasonName: form.get('seasonName'), templateId: form.get('templateId'), rarity: form.get('rarity'), signatureText: form.get('signatureText'), issueLimit: Number(form.get('issueLimit')) };
  try {
    let imageAssetId = state.form.imageAssetId;
    if (imageFile instanceof File && imageFile.size > 0) imageAssetId = await uploadAsset(imageFile, 'card');
    if (!imageAssetId) throw new Error('CARD_IMAGE_REQUIRED');
    const payload = { templateId: state.form.templateId, name: state.form.name, seasonName: state.form.seasonName, rarity: state.form.rarity, imageAssetId, artistId: state.form.artistId, memberId: state.form.memberId, signatureText: state.form.signatureText, hasVoice: state.form.hasVoice, issueLimit: state.form.issueLimit, videoAssetId: state.editor.videoAssetId, designConfig: editorDesignConfig(imageAssetId) };
    const result = editing
      ? await api(`/artist/cards/${state.editingCardId}`, { method: 'PATCH', body: JSON.stringify(payload) })
      : await api('/artist/cards', { method: 'POST', body: JSON.stringify(payload) });
    state.cardId = result.data.id;
    state.cardName = result.data.name;
    state.form.imageAssetId = result.data.imageAssetId;
    state.cards = state.editingCardId ? state.cards.map((card) => card.id === result.data.id ? result.data : card) : [result.data, ...state.cards.filter((card) => card.id !== result.data.id)];
    state.editingCardId = result.data.id;
    toast(editing ? '카드를 저장했습니다.' : '카드를 임시 저장했습니다.');
    state.step = 2;
    state.view = 'create';
    render();
  } catch {
    toast('카드 이미지 또는 디자인 저장에 실패했습니다. 아티스트 세션과 API 서버를 확인해 주세요.');
  }
}, true);

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
