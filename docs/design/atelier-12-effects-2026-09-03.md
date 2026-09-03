# Atelier 12 — 로컬 구현 및 검증 (2026-09-03)

## 범위와 구현

승인된 12종 카드 시안을 실제 WebGL2 표면 효과로 연결했다. 이미지 생성 결과 자체를 완성 카드로 보여주는 방식이 아니다. 원본 사진은 별도 이미지로 유지하며, 소재 전용 텍스처와 셰이더를 합성한다. AI 입체 카드 생성, 두 사진 홀로그램, 서버 저장·검수·배포는 이번 표면 효과 작업과 별도다.

- 스튜디오: `http://localhost:4177/`
- 독립 검증 화면: `http://localhost:4177/foil-review.html`
- 승인 시안: `builder_app/assets/effects-reference-12.png` (비교 전용; 런타임 소재로 사용하지 않음).
- 01 크리스털 포일, 02 새틴 펄, 03 골드 시그니처, 04 스펙트럼 엣지, 05 별자리 글리터, 06 유리빛 굴절, 07 리퀴드 실버, 08 레이저 인그레이빙, 09 시네마 플레어, 10 블로썸 뎁스, 11 라이트 시그니처, 12 다이아몬드 컷.
- 공통 셰이더: `builder_app/foil-renderer.js`, `builder_app/atelier-shader.js`.
- 공통 목록: `builder_app/effect-catalog.js`; 기존 패턴 ID도 정규화에서 유지.
- 팬앱: `FoilSurfaceCanvas.tsx`가 동일 렌더러를 지연 로딩한다. 준비 전/오류/컨텍스트 손실 시 기본 표현을 유지하고 리사이즈에 다시 그린다. 카드 변경 시 렌더러를 다시 연결한다.
- 스튜디오 선택 미리보기와 검증 페이지는 같은 렌더러 사용. 비교판은 한 GL 캔버스로 12개의 2D 스냅샷을 만들며, 포인터 움직임마다 12개의 GL 컨텍스트를 생성하지 않는다.
- 영구 애니메이션 루프 없이 입력·크기 변경 시 렌더링. DPR 상한 1.5.
- 9개 소재 WebP 합계 1,085,176 bytes (약 1.04 MiB). 전송 크기이지 GPU 메모리나 FPS 보장은 아니다. 현재 첫 효과 사용 시 9개를 함께 로딩하며, 추가적인 효과별 지연 로딩은 후속 최적화 후보.

## 소재 제작

내장 이미지 생성 도구로 승인 시안을 참조해 **사진 없는 소재만** 제작했다. 생성된 체커보드 배경은 실제 투명도가 아니므로 그대로 사용하지 않고 재생성했다. 은색 금속은 검정 반사를 보존하기 위해 녹색 키를 셰이더에서 제거하고 normal 합성한다. 나머지는 검정 배경 광원 맵으로 screen 합성한다. PNG 원본과 WebP 런타임 파일을 함께 보존했다. WebP는 cwebp quality 92로 변환했다.

서명처럼 보이는 장식은 생성된 가상 필기이며 실제 아티스트의 진위 인증 서명이 아니다. 실제 서명 자산 연동과 혼동하지 않아야 한다.

### 사용한 최종 프롬프트

#### liquid-silver

- 원본: `builder_app/assets/effect-liquid-silver.png`
- 런타임: `builder_app/assets/effect-liquid-silver.webp`

Precise-object-edit of the supplied single overlay. Preserve exact effect shape, position, size and details. Replace ALL of the checkerboard/white/gray background with perfectly uniform RGB(0,255,0) chroma-key green, including the center hole and small holes outside frame. No checkerboard anywhere. NO transparency representation. This is a GPU texture asset, output opaque RGB with a perfectly solid key color. Do not add a portrait, text, captions, UI or shadows in empty space. Mirror chrome reflects neutral black-white studio only, NEVER green reflected on the metal.

#### laser-engraving

- 원본: `builder_app/assets/effect-laser-engraving.png`
- 런타임: `builder_app/assets/effect-laser-engraving.webp`

Precise-object-edit of the supplied single overlay. Preserve exact effect shape, position, size and details. Replace ALL of the checkerboard/white/gray background with perfectly uniform RGB(0,0,0) PURE BLACK, including all negative space. No checkerboard anywhere. NO transparency representation. This is a GPU texture asset, output opaque RGB with a perfectly solid key color. Do not add a portrait, text, captions, UI or shadows in empty space. Keep fine silver ornamental linework bright near white for additive light compositing.

#### gold-signature

- 원본: `builder_app/assets/effect-gold-signature.png`
- 런타임: `builder_app/assets/effect-gold-signature.webp`

Precise-object-edit of the supplied single overlay. Preserve exact effect shape, position, size and details. Replace ALL of the checkerboard/white/gray background with perfectly uniform RGB(0,0,0) PURE BLACK, including all negative space. No checkerboard anywhere. NO transparency representation. This is a GPU texture asset, output opaque RGB with a perfectly solid key color. Do not add a portrait, text, captions, UI or shadows in empty space. Keep frame and autograph warm reflective bright gold.

#### blossom-depth

- 원본: `builder_app/assets/effect-blossom-depth.png`
- 런타임: `builder_app/assets/effect-blossom-depth.webp`

Precise-object-edit of the supplied single overlay. Preserve exact effect shape, position, size and details. Replace ALL of the checkerboard/white/gray background with perfectly uniform RGB(0,0,0) PURE BLACK, including all negative space. No checkerboard anywhere. NO transparency representation. This is a GPU texture asset, output opaque RGB with a perfectly solid key color. Do not add a portrait, text, captions, UI or shadows in empty space. Keep petals lavender-pink; large blurred petals should fade smoothly to PURE BLACK, no gray or white fog.

#### diamond-cut

- 원본: `builder_app/assets/effect-diamond-cut.png`
- 런타임: `builder_app/assets/effect-diamond-cut.webp`

Use case: stylized-concept. SINGLE production material texture for a WebGL2 digital photocard. Input contact sheet STYLE REFERENCE ONLY. reference12 DIAMOND CUT. Ultra-realistic clear colorless diamond-cut beveled rectangular frame. Straight optically sharp polished glass rails outermost7%, strong angled facet cuts at 4 chamfered corners, white/silver glints, narrow angular internal refracted highlights. Exquisite optical cut crystal material, NOT metal. Thin parallel glass bevel edges. Center completely black empty. No stars except two tiny corner specular flares. Flat front-on full-bleed2:3 portrait1024x1536 UV sheet aligned to edges with no margin. Empty negative space is EXACT PURE BLACK RGB(0,0,0), not white gray transparent checkerboard. This is an additive light map placed over arbitrary uploaded photos at runtime, so absolutely NO portrait or photographic background. No text, labels, title, number, UI. Show only this one material.

#### satin-pearl

- 원본: `builder_app/assets/effect-satin-pearl.png`
- 런타임: `builder_app/assets/effect-satin-pearl.webp`

Use case: stylized-concept. SINGLE production material texture for a WebGL2 digital photocard. Input contact sheet STYLE REFERENCE ONLY. reference02 SATIN PEARL. Beautiful translucent mother-of-pearl flowing silky sheet grazing left edge and lower corners. A single broad curving iridescent white pearl ribbon along leftmost20%, narrower pearl across bottom10% and along rightmost3%. Soft pink lavender tints, luminous tiny pearlescent grain. The shape wraps the perimeter, central60% fully empty black. No stars, no facets, no geometric lines. Flat front-on full-bleed2:3 portrait1024x1536 UV sheet aligned to edges with no margin. Empty negative space is EXACT PURE BLACK RGB(0,0,0), not white gray transparent checkerboard. This is an additive light map placed over arbitrary uploaded photos at runtime, so absolutely NO portrait or photographic background. No text, labels, title, number, UI. Show only this one material.

#### constellation

- 원본: `builder_app/assets/effect-constellation.png`
- 런타임: `builder_app/assets/effect-constellation.webp`

Use case: stylized-concept. SINGLE standalone production additive light texture for WebGL2 digital photocard. Input contact sheet STYLE REFERENCE ONLY. 05 CONSTELLATION GLITTER: same arrangement as reference05, elegant warm golden eight-point starbursts and thin gold constellation lines, tiny golden sparkling dust. Starbursts cluster around top left/top right and down left border, some near lower right. ~18 stars varying size with tapered rays and softly luminous cores. Keep central portrait aperture clear of stars, center region x28-80% y16-82% mostly blank, with empty base. Not many big stars across face. Rich luminous gold highlights, fine realistic glitter. Flat front-on full-bleed2:3 portrait1024x1536 UV sheet. Empty space is EXACT PURE BLACK RGB(0,0,0), no gray, transparencycheckerboard, whitebackground. NO person/photo/face or original background: photocard image will be composited at runtime. No text labels title numbers UI. One material only.

#### glass-caustics

- 원본: `builder_app/assets/effect-glass-caustics.png`
- 런타임: `builder_app/assets/effect-glass-caustics.webp`

Use case: stylized-concept. SINGLE standalone production additive light texture for WebGL2 digital photocard. Input contact sheet STYLE REFERENCE ONLY. 06 GLASS CAUSTICS: beautiful refracted caustic light from rippling glass, irregular softly flowing interconnected cells of small focus points and curved luminous cyan-white lines, tiny hints of spectral orange-blue at intersections. Same as reference06, organic optical network NOT cracks, NOT regular hexagonal honeycomb, NO straight grid. Lines concentrate on leftmost30%, top18%, rightmost12%, bottom20%, and more transparent faint curves through middle. Each glowing caustic cell about10-15% ofimagewidth. Bright optical detail against black. Flat front-on full-bleed2:3 portrait1024x1536 UV sheet. Empty space is EXACT PURE BLACK RGB(0,0,0), no gray, transparencycheckerboard, whitebackground. NO person/photo/face or original background: photocard image will be composited at runtime. No text labels title numbers UI. One material only.

#### light-signature

- 원본: `builder_app/assets/effect-light-signature.png`
- 런타임: `builder_app/assets/effect-light-signature.webp`

Use case: stylized-concept. SINGLE standalone production additive light texture for WebGL2 digital photocard. Input contact sheet STYLE REFERENCE ONLY. 11 LIGHT SIGNATURE: replicate reference11 luminous white-violet flowing light ribbon. Single elegant luminous loop arching above head area around upper-left and top to upper-right: elliptical orbital arc x5-82% y4-43%. Middle face region x30-78% y22-58% is empty. Thin white hot core surrounded by violet lavender halo. Then beautiful sweeping S-shaped autograph light trail from right-middle x85% y47% curves down across lower25%, loop near bottom-left, long graceful underline loop extending bottomright. Smooth taper, no lettering. No literal S letter. NO particles or stars, no border. Same sophisticated white luminous appearance asreference11, not dim purple rope. Flat front-on full-bleed2:3 portrait1024x1536 UV sheet. Empty space is EXACT PURE BLACK RGB(0,0,0), no gray, transparencycheckerboard, whitebackground. NO person/photo/face or original background: photocard image will be composited at runtime. No text labels title numbers UI. One material only.

## 검증과 제한

- 스튜디오 93개 테스트 통과. 팬앱 302개 테스트 통과. TypeScript/Vite 빌드 통과.
- lint 오류 없음. 기존 FanGrowth.tsx의 Fast Refresh 경고 1건은 유지.
- 실제 스튜디오에서 특수효과 탭 상태의 빈 카드 사진 선택창을 통한 샘플 업로드, 12종 목록, 선택 변경, 실버 및 새틴 렌더링, renderer ready 확인.
- 실제 검증 화면에서 12종 출력과 승인 시안을 한 화면에 대조. 금속/각인/절단 유리는 큰 카드에서도 확인했다. 왼쪽·오른쪽 각도 및 광택 0/72% 변경 확인. 광택 0에서 모든 소재가 제거되어 원본만 남았다. 검증 페이지와 스튜디오의 수집된 error/warn 로그는 비어 있었다.
- 정면 비교에서 약한 별자리와 빛 사인, 유리 굴절 패턴을 보정하고 비교판의 작은 창 가로 넘침을 수정했다.
- 자동화 테스트 중 상당수는 정규화와 소스 계약 검증이다. GPU 시각 품질과 실제 브라우저 확인을 대체하지 않는다.
- 참고 시안과 장식 곡선·꽃잎·별 좌표는 픽셀 단위로 동일하지 않다. 크리스털은 사용자가 이전에 수용한 강한 결정면 스타일을 유지했다.
- 배경 범위는 현재 중앙 타원형 보호 마스크이며 인물 자동 분할이라고 주장하지 않는다. 꽃잎 깊이 이동은 레이어 효과이며 AI 인물 3D 복원과 다르다.
- 마지막 스튜디오 읽기에서 `Failed to fetch` 토스트가 접근성 트리에 있었다. 이번에 저장/AI 생성 요청을 재실행하거나 원인을 확정하지 않았다. 표면 렌더러는 ready 상태였다. 서버 저장·재로그인·배포 E2E 완료로 간주하지 않는다.
- 실물 휴대폰 자이로, 저사양 GPU 성능, 네트워크 실패·컨텍스트 손실의 실제 주입 검증은 남아 있다.

