// Shared studio/review renderer: procedural optics + material-only texture detail.
import { EFFECT_CATALOG, ALL_FOIL_PATTERN_IDS, LEGACY_FOIL_PATTERN_IDS } from './effect-catalog.js'
import { atelierUniforms, atelierFunctions } from './atelier-shader.js?v=atelier12-3'
export const FOIL_PATTERNS = EFFECT_CATALOG.map(effect => effect.id)
export const IDLE_FOIL_PATTERNS = ['blossom-depth', 'constellation']
export function normalizeFoilSettings(settings={}) {
  const clamp=(value,fallback)=>Number.isFinite(value)?Math.max(0,Math.min(1,value)):fallback
  return {...settings,x:clamp(settings.x,.5),y:clamp(settings.y,.5),intensity:clamp(settings.intensity,.72),spread:clamp(settings.spread,.64),grain:clamp(settings.grain,.5),pattern:ALL_FOIL_PATTERN_IDS.includes(settings.pattern)?settings.pattern:'aurora-wave'}
}
export function computeCoverCrop(sourceWidth,sourceHeight,canvasWidth,canvasHeight){
  if(!(sourceWidth>0&&sourceHeight>0&&canvasWidth>0&&canvasHeight>0))return {x:0,y:0,width:1,height:1}
  const sourceAspect=sourceWidth/sourceHeight
  const canvasAspect=canvasWidth/canvasHeight
  if(sourceAspect>canvasAspect){
    const width=canvasAspect/sourceAspect
    return {x:(1-width)/2,y:0,width,height:1}
  }
  const height=sourceAspect/canvasAspect
  return {x:0,y:(1-height)/2,width:1,height}
}
let cachedMaps
let materialImages
const subjectMaskImages=new Map()
function subjectMaskImage(url){
  if(subjectMaskImages.has(url))return subjectMaskImages.get(url)
  const promise=new Promise((resolve,reject)=>{
    const img=new Image();img.decoding='async';img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('인물 마스크 로딩 실패'));img.src=url
  }).catch(error=>{subjectMaskImages.delete(url);throw error})
  subjectMaskImages.set(url,promise)
  if(subjectMaskImages.size>24)subjectMaskImages.delete(subjectMaskImages.keys().next().value)
  return promise
}
const materialNames=['silverMap','engravingMap','goldMap','petalsMap','diamondMap','satinMap','constellationTexture','causticsMap','signatureMap']
function loadMaterialImages(){
  if(!materialImages)materialImages=Promise.all(['liquid-silver','laser-engraving','gold-signature','blossom-depth','diamond-cut','satin-pearl','constellation','glass-caustics','light-signature'].map(name=>new Promise((resolve,reject)=>{
    const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error(`소재 이미지 로딩 실패: ${name}`));img.src=new URL(`./assets/effect-${name}.webp`,import.meta.url).href
  }))).catch(error=>{materialImages=undefined;throw error})
  return materialImages
}

function foilMaps() {
  if (cachedMaps) return cachedMaps
  let seed = 43109
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296 }
  const make = () => { const c = document.createElement('canvas'); c.width = 768; c.height = 1152; return c }
  const faces = make(), lines = make(), stars = make()
  const face = faces.getContext('2d'), line = lines.getContext('2d'), star = stars.getContext('2d')
  const points = []
  for (let y = 0; y <= 8; y++) {
    points[y] = []
    for (let x = 0; x <= 5; x++) points[y][x] = [(x + (x > 0 && x < 5 ? (random() - .5) * .95 : 0)) * 768 / 5, (y + (y > 0 && y < 8 ? (random() - .5) * .95 : 0)) * 1152 / 8]
  }
  const triangle = (a, b, c) => {
    face.beginPath(); face.moveTo(...a); face.lineTo(...b); face.lineTo(...c); face.closePath()
    const r = Math.floor(random() * 255), g = Math.floor(random() * 255), bVal = Math.floor(random() * 255)
    face.fillStyle = `rgb(${r},${g},${bVal})`; face.fill()
    line.beginPath(); line.moveTo(...a); line.lineTo(...b); line.lineTo(...c); line.closePath()
    line.strokeStyle = `rgba(255,255,255,${.12 + random() * .3})`; line.lineWidth = .7; line.stroke()
  }
  for (let y = 0; y < 8; y++) for (let x = 0; x < 5; x++) {
    const a = points[y][x], b = points[y][x + 1], c = points[y + 1][x], d = points[y + 1][x + 1]
    if (random() > .5) { triangle(a, b, d); triangle(a, d, c) } else { triangle(a, b, c); triangle(b, d, c) }
  }
  // Four narrow tapered rays, a softer diagonal pair, and a small luminous core.
  const burst = (x, y, radius, rotation) => {
    star.save(); star.translate(x, y); star.rotate(rotation)
    const glow = star.createRadialGradient(0, 0, 0, 0, 0, radius * .38)
    glow.addColorStop(0, 'rgba(255,255,255,.95)'); glow.addColorStop(.15, 'rgba(220,242,255,.45)'); glow.addColorStop(1, 'rgba(255,255,255,0)')
    star.fillStyle = glow; star.fillRect(-radius, -radius, radius * 2, radius * 2)
    for (let n = 0; n < 4; n++) {
      star.rotate(Math.PI / 2)
      const ray = star.createLinearGradient(0, 0, radius, 0)
      ray.addColorStop(0, 'rgba(255,255,255,.95)'); ray.addColorStop(.25, 'rgba(232,249,255,.65)'); ray.addColorStop(1, 'rgba(255,255,255,0)')
      star.fillStyle = ray; star.beginPath(); star.moveTo(-1, -1.3); star.lineTo(radius, 0); star.lineTo(-1, 1.3); star.fill()
    }
    star.fillStyle = '#fff'; star.beginPath(); star.arc(0, 0, 1.5, 0, 7); star.fill(); star.restore()
  }
  const anchors = [[.31,.12,57],[.18,.36,31],[.68,.42,45],[.43,.56,62],[.71,.82,72],[.26,.73,40],[.86,.19,27],[.84,.62,30]]
  anchors.forEach(([x,y,r]) => burst(x*768,y*1152,r*1.45,-.36))
  for (let i=0;i<46;i++) burst(random()*768,random()*1152,5+random()*17,-.36)
  cachedMaps = [faces, lines, stars]
  return cachedMaps
}

const vertexSource = `#version 300 es
in vec2 position;
out vec2 uv;
void main(){uv=vec2(position.x*.5+.5,.5-position.y*.5);gl_Position=vec4(position,0.,1.);}`

const fragmentSource = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D faces;
uniform sampler2D lines;
uniform sampler2D stars;
uniform vec2 pointer;
uniform float intensity;
uniform float spread;
uniform float grain;
uniform float pattern;
uniform float material;
uniform float coverage;
uniform sampler2D subjectMask;
uniform float hasSubjectMask;
uniform vec4 subjectMaskCrop;
${atelierUniforms}
out vec4 color;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
vec3 spectrum(float x){return .5+.5*cos(6.2831853*(x+vec3(0.,.67,.33)));}
float beam(vec2 p,float offset,float width){return exp(-pow((p.x+p.y*.7-offset)/width,2.));}
float coverageMask(vec2 currentUv){
  if(coverage>.5&&coverage<1.5){
    vec2 maskUv=subjectMaskCrop.xy+currentUv*subjectMaskCrop.zw;
    return hasSubjectMask>.5?clamp(1.-dot(texture(subjectMask,maskUv).rgb,vec3(.299,.587,.114)),0.,1.):0.;
  }
  if(coverage>1.5&&coverage<2.5){vec2 e=min(currentUv,1.-currentUv);return 1.-smoothstep(.025,.07,min(e.x,e.y));}
  if(coverage>2.5)return smoothstep(.69,.9,currentUv.y);
  return 1.;
}
${atelierFunctions}
void main(){
  vec2 q=uv*vec2(1.,1.5);
  vec2 light=(pointer-.5)*vec2(1.1,.85);
  if(atelier>.5){
    color=atelierEffect(uv,light);
    if(material>.5&&material<1.5){color.rgb=mix(color.rgb,vec3(.95,.88,1.),.1);color.a*=.95;}
    if(material>1.5){color.rgb=pow(color.rgb,vec3(.85));color.a=min(1.,color.a*1.12);}
    color.a*=coverageMask(uv);
    return;
  }
  vec3 f=texture(faces,uv).rgb;
  float phase=dot(f.rg*2.-1.,light)*2.2;
  float edge=texture(lines,uv).a;
  float reflection=pow(.5+.5*sin(f.b*18.+phase*5.),7.);
  float ribbon=beam(q,.51+light.x*.7,.035+spread*.025)+beam(q,1.39+light.x*.5,.018+spread*.026);
  float shardPosition=fract(q.x*.72+q.y*.9+f.r*.7+phase*.17)-.5;
  float shardBand=exp(-pow(shardPosition/(.025+spread*.06),2.));
  vec3 rainbow=spectrum(shardPosition*5.8+f.g*.3+phase*.17);
  float core=exp(-pow((shardPosition+.017)/.008,2.));
  vec3 foil=(rainbow*shardBand*1.35+vec3(.63,.85,1.)*core*.22)*(.3+reflection*1.2)*(.45+f.b*.55);
  foil+=spectrum((q.x+q.y*.7)*4.+light.x)*ribbon*.12;
  // Thousands of subpixel, irregular glitter grains. Stable positions; light changes brightness.
  vec2 cell=floor(uv*vec2(165.,248.));
  vec2 local=fract(uv*vec2(165.,248.))-(.15+.7*vec2(hash(cell+17.),hash(cell+53.)));
  float rnd=hash(cell);
  float dust=exp(-dot(local,local)*80.)*step(.46,rnd);
  dust*=.14+.86*pow(.5+.5*sin(rnd*65.+light.x*9.+light.y*5.),6.);
  vec3 sparkle=spectrum(rnd+phase*.08)*dust*(.25+grain*1.6);
  float star=texture(stars,uv).a;
  float starLight=.42+.58*pow(.5+.5*sin(uv.x*13.+uv.y*17.+light.x*6.),2.);
  vec3 bursts=vec3(.86,.95,1.)*star*starLight*1.8;
  vec3 rgb;
  if(pattern<.5){
    // Reference composition: irregular crystal foil + fine threads + dust + long star rays.
    rgb=foil*1.35+rainbow*edge*.65+sparkle*1.4+bursts;
    float rim=exp(-pow(roundedFrame(q,.025,.05)/.0018,2.))+exp(-pow(roundedFrame(q,.039,.042)/.0011,2.));
    rgb+=vec3(.85,.9,1.)*rim*.5;
  }else if(pattern<1.5){
    rgb=foil*2.65+rainbow*edge*.18+sparkle*.12+bursts*.28;
  }else if(pattern<2.5){
    rgb=vec3(.68,.85,1.)*edge*2.1+rainbow*reflection*.15+sparkle*.35+bursts*.3;
  }else if(pattern<3.5){
    rgb=sparkle*1.5+bursts*1.5;
  }else if(pattern<4.5){
    float flow=q.y*7.+sin(q.x*9.+q.y*3.)*1.5+light.x*4.;
    float silver=pow(.5+.5*sin(flow),12.);
    rgb=vec3(.83,.9,1.)*silver*.95+vec3(.35,.42,.52)*pow(.5+.5*cos(flow*.46),3.)*.25;
  }else{
    float d=q.x-q.y*.76-light.x*.65+.28;
    float flare=exp(-d*d/(.00018+spread*.0007));
    float halo=exp(-d*d/.012)*.19;
    rgb=spectrum(d*9.+.05)*flare*.9+vec3(.63,.81,1.)*halo+bursts*.6;
  }
  rgb*=intensity/.72;
  if(material>.5&&material<1.5)rgb+=vec3(.21,.16,.3)*beam(q,1.+light.x,.6)*intensity*.15;
  if(material>1.5)rgb*=1.22;
  float mask=coverageMask(uv);
  rgb=clamp(rgb*mask,0.,1.);
  float alpha=max(rgb.r,max(rgb.g,rgb.b));
  color=vec4(rgb/max(alpha,.001),alpha);
}`

export function createFoilRenderer(canvas) {
  const gl=canvas.getContext('webgl2',{alpha:true,antialias:false,premultipliedAlpha:false,preserveDrawingBuffer:true})
  if(!gl)throw new Error('WebGL2 unavailable')
  const shaders=[], textures=[]
  let program, buffer, vao, disposed=false
  const dispose=()=>{
    if(disposed)return
    disposed=true
    textures.forEach(t=>gl.deleteTexture(t)); shaders.forEach(s=>gl.deleteShader(s))
    if(buffer)gl.deleteBuffer(buffer); if(vao)gl.deleteVertexArray(vao); if(program)gl.deleteProgram(program)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
  try {
    const compile=(type,source)=>{const s=gl.createShader(type);shaders.push(s);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s}
    program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertexSource));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragmentSource));gl.linkProgram(program)
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program))
    gl.useProgram(program);vao=gl.createVertexArray();gl.bindVertexArray(vao)
    buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW)
    const p=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(p);gl.vertexAttribPointer(p,2,gl.FLOAT,false,0,0)
    const upload=(map,i,name)=>{
      const t=gl.createTexture();textures.push(t);gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,t)
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE)
      if(map)gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,map)
      else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(name==='silverMap'?[0,255,0,255]:[0,0,0,0]))
      gl.uniform1i(gl.getUniformLocation(program,name),i)
    }
    foilMaps().forEach((map,i)=>upload(map,i,['faces','lines','stars'][i]))
    materialNames.forEach((name,i)=>upload(null,i+3,name))
    upload(null,12,'subjectMask')
    const uniforms=Object.fromEntries(['pointer','intensity','spread','grain','pattern','material','coverage','atelier','hasSubjectMask','subjectMaskCrop','time'].map(k=>[k,gl.getUniformLocation(program,k)]))
    let lastSettings={}
    let subjectMaskSource=null,subjectMaskSize={width:0,height:0}
    const sizeOf=source=>({width:source?.naturalWidth||source?.videoWidth||source?.width||0,height:source?.naturalHeight||source?.videoHeight||source?.height||0})
    function setSubjectMask(source){
      if(disposed)return
      subjectMaskSource=source||null
      subjectMaskSize=sizeOf(subjectMaskSource)
      gl.activeTexture(gl.TEXTURE0+12);gl.bindTexture(gl.TEXTURE_2D,textures[12])
      if(subjectMaskSource&&subjectMaskSize.width>0&&subjectMaskSize.height>0)gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,subjectMaskSource)
      gl.useProgram(program);gl.uniform1f(uniforms.hasSubjectMask,subjectMaskSize.width>0&&subjectMaskSize.height>0?1:0)
    }
    function draw(settings={}){
      if(disposed)return
      lastSettings=settings
      const {x,y,intensity,spread,grain,pattern,material='matte',coverage='full'}=normalizeFoilSettings(settings)
      canvas.style.mixBlendMode=pattern==='liquid-silver'?'normal':'screen'
      const ratio=Math.min(window.devicePixelRatio||1,1.5)
      const width=Math.max(1,Math.round(canvas.clientWidth*ratio)),height=Math.max(1,Math.round(canvas.clientHeight*ratio))
      if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height}
      gl.viewport(0,0,width,height);gl.useProgram(program);gl.bindVertexArray(vao)
      gl.uniform2f(uniforms.pointer,x,y)
      const crop=computeCoverCrop(subjectMaskSize.width,subjectMaskSize.height,width,height)
      gl.uniform4f(uniforms.subjectMaskCrop,crop.x,crop.y,crop.width,crop.height)
      gl.uniform1f(uniforms.hasSubjectMask,subjectMaskSize.width>0&&subjectMaskSize.height>0?1:0)
      gl.uniform1f(uniforms.time,Number.isFinite(settings.time)?settings.time:0)
      for(const [key,value] of Object.entries({intensity,spread,grain,atelier:Math.max(0,FOIL_PATTERNS.indexOf(pattern)),pattern:Math.max(0,LEGACY_FOIL_PATTERN_IDS.indexOf(pattern)),material:Math.max(0,['matte','pearl','chrome'].indexOf(material)),coverage:Math.max(0,['full','background','frame','signature'].indexOf(coverage))}))gl.uniform1f(uniforms[key],value)
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4)
    }
    const ready=loadMaterialImages().then(images=>{
      if(disposed)return
      images.forEach((img,i)=>{gl.activeTexture(gl.TEXTURE0+i+3);gl.bindTexture(gl.TEXTURE_2D,textures[i+3]);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img)})
      draw(lastSettings)
    })
    return {draw,setSubjectMask,dispose,ready}
  }catch(error){dispose();throw error}
}

const active=new Map()
let thumbnails
export function initFoilCards(root=document){
  for(const [canvas,cleanup] of active)if(!canvas.isConnected){cleanup();active.delete(canvas)}
  root.querySelectorAll('[data-webgl-effect]').forEach(canvas=>{
    if(active.has(canvas))return
    const card=canvas.closest('[data-hologram-card]')
    if(!card)return
    try{
      const renderer=createFoilRenderer(canvas)
      let x=.5,y=.5,frame=0,idleFrame=0,subjectMaskUrl,subjectMaskLoadId=0,cleaned=false
      const cardPattern=()=>card.className.match(/pattern-([\w-]+)/)?.[1]
      const isIdlePattern=()=>IDLE_FOIL_PATTERNS.includes(cardPattern())
      const draw=()=>{
        frame=0
        const css=card.style
        renderer.draw({x,y,time:isIdlePattern()?performance.now()/1000:0,pattern:cardPattern(),material:card.className.match(/material-([\w-]+)/)?.[1],coverage:card.className.match(/coverage-([\w-]+)/)?.[1],intensity:Number(css.getPropertyValue('--effect-opacity')||.72),spread:parseFloat(css.getPropertyValue('--effect-spread')||64)/100,grain:Number(css.getPropertyValue('--effect-grain')||.38)})
      }
      const idleTick=()=>{if(cleaned||!isIdlePattern())return;draw();idleFrame=requestAnimationFrame(idleTick)}
      const schedule=()=>{if(!frame)frame=requestAnimationFrame(draw)}
      const syncSubjectMask=()=>{
        const nextUrl=canvas.dataset.subjectMask||''
        if(nextUrl===subjectMaskUrl)return
        subjectMaskUrl=nextUrl
        const loadId=++subjectMaskLoadId
        if(!nextUrl){renderer.setSubjectMask(null);schedule();return}
        subjectMaskImage(nextUrl).then(img=>{
          if(cleaned||loadId!==subjectMaskLoadId||canvas.dataset.subjectMask!==nextUrl)return
          renderer.setSubjectMask(img);schedule()
        }).catch(error=>{
          if(cleaned||loadId!==subjectMaskLoadId)return
          renderer.setSubjectMask(null);schedule();console.warn(error.message)
        })
      }
      const move=event=>{const b=card.getBoundingClientRect();x=Math.min(1,Math.max(0,(event.clientX-b.left)/b.width));y=Math.min(1,Math.max(0,(event.clientY-b.top)/b.height));schedule()}
      const reset=()=>{x=.5;y=.5;schedule()}
      card.addEventListener('pointermove',move);card.addEventListener('pointerleave',reset);card.addEventListener('pointercancel',reset)
      canvas.addEventListener('webgl-refresh',schedule)
      const observer=new ResizeObserver(schedule);observer.observe(canvas)
      // Device motion uses the same CSS light coordinates as pointer tilt.
      const motionObserver=new MutationObserver(()=>{
        x=parseFloat(card.style.getPropertyValue('--light-x')||50)/100
        y=parseFloat(card.style.getPropertyValue('--light-y')||50)/100
        schedule()
      })
      motionObserver.observe(card,{attributes:true,attributeFilter:['style']})
      const maskObserver=new MutationObserver(syncSubjectMask)
      maskObserver.observe(canvas,{attributes:true,attributeFilter:['data-subject-mask']})
      active.set(canvas,()=>{cleaned=true;++subjectMaskLoadId;cancelAnimationFrame(frame);cancelAnimationFrame(idleFrame);observer.disconnect();motionObserver.disconnect();maskObserver.disconnect();card.removeEventListener('pointermove',move);card.removeEventListener('pointerleave',reset);card.removeEventListener('pointercancel',reset);canvas.removeEventListener('webgl-refresh',schedule);renderer.dispose()})
      canvas.style.visibility='hidden';canvas.dataset.webglReady='loading';syncSubjectMask();draw();if(isIdlePattern())idleFrame=requestAnimationFrame(idleTick)
      renderer.ready.then(()=>{
        if(canvas.isConnected){canvas.dataset.webglReady='true';canvas.style.visibility='visible';card.classList.add('webgl2-ready');schedule()}
      }).catch(error=>{
        canvas.dataset.webglReady='failed';canvas.style.visibility='hidden';card.classList.remove('webgl2-ready');canvas.setAttribute('aria-label',error.message)
        active.get(canvas)?.();console.warn(error.message)
      })
    }catch(error){canvas.dataset.webglFallback='true';canvas.setAttribute('aria-label','WebGL2 미지원 · 기본 포일 효과 사용');console.warn('Foil renderer:',error.message)}
  })
  const swatches=root.querySelectorAll('[data-foil-swatch]')
  if(swatches.length){
    if(!thumbnails){
      thumbnails='loading'
      const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;left:-9999px;width:180px;height:100px';document.body.append(canvas)
      try{const renderer=createFoilRenderer(canvas);renderer.ready.then(()=>{
        thumbnails=Object.fromEntries(FOIL_PATTERNS.map(pattern=>{renderer.draw({pattern,intensity:.85});return[pattern,canvas.toDataURL()]}))
        applySwatches(document)
      }).catch(error=>{thumbnails=undefined;console.warn('Foil swatches:',error.message)}).finally(()=>{renderer.dispose();canvas.remove()})}catch(error){thumbnails=undefined;canvas.remove();console.warn('Foil swatches:',error.message)}
    }
    applySwatches(root)
  }
}
function applySwatches(root){
  if(!thumbnails||thumbnails==='loading')return
  root.querySelectorAll('[data-foil-swatch]').forEach(el=>{el.style.backgroundImage=`url("${thumbnails[el.dataset.foilSwatch]}")`;el.style.backgroundColor='#22233e';el.style.backgroundSize='100% 100%'})
}
