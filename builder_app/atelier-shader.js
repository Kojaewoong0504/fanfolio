// Runtime materials. Raster inputs contain material-only detail, never the photo.
export const atelierUniforms = `
uniform float atelier;
uniform sampler2D silverMap;
uniform sampler2D engravingMap;
uniform sampler2D goldMap;
uniform sampler2D petalsMap;
uniform sampler2D diamondMap;
uniform sampler2D satinMap;
uniform sampler2D constellationTexture;
uniform sampler2D causticsMap;
uniform sampler2D signatureMap;
uniform float time;
`

export const atelierFunctions = `
float roundedFrame(vec2 p,float inset,float radius){
  vec2 d=abs(p-vec2(.5,.75))-(vec2(.5,.75)-inset-radius);
  return length(max(d,0.))+min(max(d.x,d.y),0.)-radius;
}
float starRay(vec2 p,float size){
  float r=length(p);
  float core=exp(-r*r/(size*size*.04));
  float rays=exp(-abs(p.x*p.y)/(size*size*.003))*exp(-r/size);
  return core+rays*.7;
}
vec3 lightGold(vec2 p,vec2 l){
  vec3 a=texture(goldMap,p).rgb;
  float shine=pow(.5+.5*sin(p.x*5.+p.y*8.-l.x*9.-l.y*4.),12.-spread*9.);
  float brushed=.9+grain*.10*sin(p.y*2300.);
  return a*(.7+shine*.8)*brushed;
}
vec4 atelierEffect(vec2 p,vec2 l){
  vec2 q=p*vec2(1.,1.5);
  vec3 rgb=vec3(0.);
  // satin-pearl
  if(atelier<1.5){
    vec2 t=clamp(p+vec2(sin(p.y*5.)*l.x,l.y*.2)*.016,.001,.999);
    vec3 silkMap=texture(satinMap,t).rgb;
    float fold=p.x-(.115+.07*sin(p.y*5.+l.y*1.5)+l.x*.12);
    float silk=exp(-pow(fold/(.035+spread*.1),2.));
    float fine=exp(-pow((fold+.041)/.007,2.))*.12;
    float bottom=exp(-pow((p.y-.94-l.y*.04)/.10,2.))*.28;
    vec3 pearl=mix(vec3(.75,.8,1.),vec3(1.,.8,.89),.5+.5*sin(fold*20.+p.y*4.+l.x*3.));
    rgb=silkMap*(.58+.3*silk)+pearl*(fine+bottom)*.12;
    rgb+=silkMap*pow(.5+.5*sin(fold*250.),10.)*grain*.06;
  }
  // gold-signature: material-only border and glints. The artist's real
  // handwriting layer is composited separately so a stock signature is never
  // shown when the card has no signature.
  else if(atelier<2.5){
    float d=roundedFrame(q,.027,.055);
    float band=exp(-d*d/.000013);
    float glow=exp(-d*d/(.00025+spread*.0006));
    // A broad directional reflection travels across the whole card as the
    // light vector changes. The border alone reads as a static outline.
    vec3 goldSheet=texture(goldMap,p).rgb;
    float goldSweep=exp(-pow((p.x+p.y*.62-dot(l,vec2(.85,.55))*.34-.22)/(.085+spread*.13),2.));
    float goldFlash=.5+.5*sin(p.x*5.2+p.y*8.1-dot(l,vec2(9.,4.)));
    float sweep=.5+.5*sin(p.x*4.5+p.y*7.-l.x*8.-l.y*4.);
    vec3 gold=vec3(1.,.68,.16);
    rgb=goldSheet*gold*(.035+goldSweep*(.16+goldFlash*.18));
    rgb+=gold*(band*.9+glow*(.16+sweep*.18));
    rgb+=vec3(1.,.88,.42)*starRay(q-vec2(.94,.06),.016+grain*.025)*(.45+l.x*.3);
    rgb+=vec3(1.,.88,.42)*starRay(q-vec2(.06,1.44),.016+grain*.025)*(.45-l.x*.2);
  }
  // spectrum-edge
  else if(atelier<3.5){
    float d=roundedFrame(q,.027,.055);
    float band=exp(-d*d/.000013);
    float glow=exp(-d*d/(.00025+spread*.0006));
    vec3 hue=spectrum(p.x*.9+p.y*.55-l.x*.7-l.y*.25);
    rgb=hue*(band*.95+glow*.2);
    rgb+=vec3(.85,.95,1.)*starRay(q-vec2(.94,.06),.016+grain*.025)*(.5+l.x);
  }
  // constellation
  else if(atelier<4.5){
    vec3 c=texture(constellationTexture,p).rgb;
    float twinkle=.65+.35*pow(.5+.5*sin(p.x*23.+p.y*32.+l.x*10.+l.y*6.),2.);
    rgb=c*(.65+grain*.5)*twinkle*(.8+spread*.3)*2.15;
  }
  // glass-caustics
  else if(atelier<5.5){
    // A neutral central aperture protects the portrait without claiming AI segmentation.
    vec2 t=p+vec2(sin(p.y*14.+l.y*3.),cos(p.x*13.+l.x*3.))*l*.012;
    vec3 caustics=texture(causticsMap,clamp(t,.001,.999)).rgb;
    float focus=.7+.3*sin(p.y*11.+p.x*7.+l.x*4.);
    rgb=caustics*(.65+grain*.55)*focus*(.65+spread*.65);
  }
  // liquid-silver
  else if(atelier<6.5){
    // A keyed material lets the chrome retain black reflections, unlike additive foil.
    vec2 t=p+vec2(sin(p.y*15.+l.x)*l.x,cos(p.x*18.+l.y)*l.y)*.0025;
    vec3 c=texture(silverMap,clamp(t,.001,.999)).rgb;
    float green=c.g-max(c.r,c.b);
    float alpha=1.-smoothstep(.08,.3,green);
    c.g=min(c.g,max(c.r,c.b)+.015);
    float metal=dot(c,vec3(.3333));
    float sweep=pow(.5+.5*sin(p.x*7.+p.y*13.-l.x*7.-l.y*3.),8.);
    c=mix(c,vec3(.85,.9,1.),sweep*(.18+spread*.2)*smoothstep(.08,.65,metal));
    c*=.78+.22*grain;
    return vec4(clamp(c,0.,1.),alpha*min(1.,intensity/.72));
  }
  // laser-engraving
  else if(atelier<7.5){
    vec3 c=texture(engravingMap,p).rgb;
    float sweep=exp(-pow((p.x+p.y*.65-.75-l.x*.9)/(.09+spread*.2),2.));
    rgb=c*vec3(.85,.91,1.)*(.72+sweep*.7+grain*.16);
  }
  // cinema-flare
  else if(atelier<8.5){
    vec2 origin=vec2(.18+l.x*.15,1.26+l.y*.13);
    vec2 d=q-origin;
    float streak=exp(-pow(d.y/(.007+spread*.005),2.))*exp(-abs(d.x)*.7);
    float bloom=exp(-dot(d,d)/.0018);
    rgb=mix(vec3(.38,.78,1.),vec3(1.,.80,.4),smoothstep(.1,.75,p.x))*(streak*1.8+bloom*1.8);
    for(int i=0;i<5;i++){
      float k=float(i);
      vec2 center=vec2(.86-l.x*.10,.10+k*.12+l.y*.13);
      float r=length(q-center);
      float radius=.032+.013*hash(vec2(k));
      float disk=(1.-smoothstep(radius*.75,radius,r))*.28;
      float ring=exp(-pow((r-radius)/.002,2.))*.04;
      rgb+=mix(vec3(.35,.67,1.),vec3(1.,.75,.3),mod(k,2.))*(disk+ring)*(grain+.2);
    }
  }
  // blossom-depth
  else if(atelier<9.5){
    // Near petals move farther than the small upper petals; original photo is untouched.
    float depth=.25+.75*smoothstep(.60,.95,p.y);
    vec2 drift=vec2(sin(time*.75+p.y*8.),cos(time*.62+p.x*7.))*vec2(.008,.006);
    vec2 t=(p-.5)*.97+.5-l*vec2(.035,.026)*depth*(.4+spread)+drift*depth;
    vec3 a=texture(petalsMap,clamp(t,.001,.999)).rgb;
    rgb=a*(.8+grain*.25);
  }
  // light-signature
  else if(atelier<10.5){
    vec2 t=clamp(p-l*vec2(.008,.004),.001,.999);
    vec3 c=texture(signatureMap,t).rgb;
    float chase=.55+grain*.2+.35*pow(.5+.5*sin(p.x*7.+p.y*8.-l.x*6.-l.y*3.),4.);
    rgb=c*(.9+spread*.3)*chase;
  }
  // diamond-cut
  else{
    vec2 a=abs(q-vec2(.5,.75));
    float side=max(a.x-.474,a.y-.724);
    float bevel=max(side,(a.x+a.y-1.143)*.7071);
    float depth=-bevel;
    float band=smoothstep(-.002,.002,depth)*(1.-smoothstep(.037,.045,depth));
    float lightDir=sin(atan(q.y-.75,q.x-.5)*2.0-l.x*3.+l.y);
    float faces=.18+(.2+spread*.36)*pow(.5+.5*sin(depth*270.+lightDir*2.),2.);
    float outline=exp(-pow((depth-.002)/.0014,2.))+exp(-pow((depth-.039)/.0014,2.));
    vec3 cutGlass=texture(diamondMap,p).rgb;
    rgb=cutGlass*(.65+faces*.7)+vec3(.79,.88,1.)*(band*faces+outline*.52)*.12;
    // Fine diagonal cut planes where chamfered corners join the straight bevels.
    float seam=exp(-pow((a.x-a.y+.25)/.0016,2.))*band;
    rgb+=vec3(.9,.95,1.)*seam*.45;
    rgb+=vec3(1.)*starRay(q-vec2(.925,1.414),.025+grain*.038)*(.7+l.x*.6);
    rgb+=vec3(.8,.9,1.)*starRay(q-vec2(.065,.086),.027)*(.6-l.x*.5);
  }
  rgb*=intensity/.72;
  float m=max(rgb.r,max(rgb.g,rgb.b));
  return vec4(clamp(rgb/max(m,.001),0.,1.),clamp(m,0.,1.));
}
`
