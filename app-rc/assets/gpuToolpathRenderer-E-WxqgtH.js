import{$ as e,D as t,F as n,G as r,K as i,O as a,Q as o,V as s,Z as c,d as l,h as u,m as d,p as f,s as p}from"./three-vErlhwpQ.js";import{a as m,c as h,i as g,l as _,n as v,o as y,r as b,s as x,t as S}from"./index-Dzuuzq5U.js";var C=`
  attribute vec4 endpoints;
  uniform vec3 view;
  uniform vec2 viewport;
  uniform float lineWidth;
  varying float along;
  void main() {
    vec2 delta = endpoints.zw - endpoints.xy;
    float lengthPx = length(delta) * view.x;
    vec2 direction = delta / max(length(delta), 0.000001);
    vec2 point = mix(endpoints.xy, endpoints.zw, position.x) * view.x + view.yz;
    point += vec2(-direction.y, direction.x) * position.y * lineWidth;
    along = position.x * lengthPx;
    gl_Position = vec4(point.x / viewport.x * 2.0 - 1.0, 1.0 - point.y / viewport.y * 2.0, 0.0, 1.0);
  }
`,w=`
  uniform float dashed;
  varying float along;
  void main() {
    if (dashed > 0.5 && mod(along, 7.0) >= 3.0) discard;
    gl_FragColor = vec4(1.0);
  }
`,T=`
  varying vec2 sampleUv;
  void main() {
    sampleUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`,E=`
  uniform sampler2D coverage;
  uniform vec3 stroke;
  uniform float alpha;
  varying vec2 sampleUv;
  void main() {
    // Colour is already display-referred sRGB, matching Canvas CSS colours.
    gl_FragColor = vec4(stroke, texture2D(coverage, sampleUv).r * alpha);
  }
`,D=class{canvas=null;texture=null;material=null;geometry=null;scene=new r;toolpath=null;key=``;render(e,t,r,a,o,c,l,u,f,p){if(!a||!r.bounds||!u.directions||p&&!r.debugToolpath)return;this.canvas||(this.canvas=document.createElement(`canvas`),this.texture=new d(this.canvas),this.texture.colorSpace=``,this.texture.generateMipmaps=!1,this.material=new i({uniforms:{annotations:{value:this.texture}},vertexShader:T,fragmentShader:`
          uniform sampler2D annotations;
          varying vec2 sampleUv;
          void main() { gl_FragColor = texture2D(annotations, sampleUv); }
        `,transparent:!0,depthTest:!1,depthWrite:!1}),this.geometry=new s(2,2),this.scene.add(new n(this.geometry,this.material)));let m=JSON.stringify([o.scale,o.offsetX,o.offsetY,c,l,u,f,p]);if(this.toolpath!==r||this.key!==m){(this.canvas.width!==c||this.canvas.height!==l)&&(this.texture.dispose(),this.texture=new d(this.canvas),this.texture.colorSpace=``,this.texture.generateMipmaps=!1,this.material.uniforms.annotations.value=this.texture),this.canvas.width=c,this.canvas.height=l;let e=this.canvas.getContext(`2d`);if(!e)throw Error(`Toolpath annotation canvas is unavailable`);v(e,r,o,!0,u,{deferArrows:p}),this.texture.needsUpdate=!0,this.toolpath=r,this.key=m}e.render(this.scene,t)}retain(e){this.toolpath&&!e.has(this.toolpath)&&this.dispose()}dispose(){this.texture?.dispose(),this.material?.dispose(),this.geometry?.dispose(),this.scene.clear(),this.canvas&&(this.canvas.width=0,this.canvas.height=0),this.canvas=null,this.texture=null,this.material=null,this.geometry=null,this.toolpath=null,this.key=``}},O=class{canvas;renderer;camera=new f;mask=new e(1,1,{samples:4,depthBuffer:!1});view=new o;viewport=new c;maskMaterial=new i({uniforms:{view:{value:this.view},viewport:{value:this.viewport},lineWidth:{value:1},dashed:{value:0}},vertexShader:C,fragmentShader:w,blending:0,depthTest:!1,depthWrite:!1,side:2});compositeMaterial=new i({uniforms:{coverage:{value:this.mask.texture},stroke:{value:new u},alpha:{value:1}},vertexShader:T,fragmentShader:E,transparent:!0,depthTest:!1,depthWrite:!1});quadGeometry=new s(2,2);compositeScene=new r;cache=new Map;annotations=new D;lost=!1;disposed=!1;onLoss;onRestore;stats={preparations:0,preparationMs:0,submissions:0,firstToolpathSubmissionMs:0};constructor(e,t){this.canvas=e;let r=e.getContext(`webgl2`,{alpha:!0,antialias:!1,premultipliedAlpha:!0});if(!r)throw Error(`WebGL2 is unavailable; retaining Canvas toolpaths`);try{this.renderer=new p({canvas:e,context:r})}catch(e){throw r.getExtension(`WEBGL_lose_context`)?.loseContext(),e}this.renderer.autoClear=!1,this.renderer.setClearColor(0,0),this.mask.texture.colorSpace=``,this.compositeScene.add(new n(this.quadGeometry,this.compositeMaterial)),this.renderer.debug.onShaderError=()=>{throw Error(`GPU toolpath shader compilation failed`)},this.onLoss=n=>{n.preventDefault(),this.lost=!0,e.hidden=!0,t()},this.onRestore=()=>{this.lost=!1,t()},e.addEventListener(`webglcontextlost`,this.onLoss),e.addEventListener(`webglcontextrestored`,this.onRestore)}get available(){return!this.disposed&&!this.lost&&!this.renderer.getContext().isContextLost()}batch(e){let i={scene:new r,geometries:[]};for(let r=0;r<e.length;r+=65536){let o=Math.min(65536,e.length-r),s=new Float32Array(o*4);for(let t=0;t<o;t++){let n=e[r+t];s.set([n.from.x,n.from.y,n.to.x,n.to.y],t*4)}let c=new a;c.setAttribute(`position`,new l(new Float32Array([0,-.5,0,1,-.5,0,1,.5,0,0,.5,0]),3)),c.setIndex([0,1,2,0,2,3]),c.setAttribute(`endpoints`,new t(s,4)),c.instanceCount=o;let u=new n(c,this.maskMaterial);u.frustumCulled=!1,i.scene.add(u),i.geometries.push(c)}return i}prepare(e,t){let n=this.cache.get(e);if(n?.slotScale===t)return n;n&&this.release(n);let r=y(e),i=new Map;for(let e of r.cuts){let n=_(e.feedScale,t),r=i.get(n);r?r.push(e):i.set(n,[e])}let a={slotScale:t,layers:{cuts:this.batch(r.cuts),leadIns:this.batch(r.leadIns),rapids:this.batch(r.rapids),plunges:this.batch(r.plunges),retractions:this.batch(r.retractions)},feeds:new Map([...i].map(([e,t])=>[e,this.batch(t)])),collisions:this.batch((e.collidingMoveIndices??[]).map(t=>e.moves[t]).filter(Boolean))};return this.cache.set(e,a),a}paint(e,t,n,r,i=!1){if(e.geometries.length===0)return;this.maskMaterial.uniforms.lineWidth.value=n,this.maskMaterial.uniforms.dashed.value=i?1:0,this.renderer.setRenderTarget(this.mask),this.renderer.clear(),this.renderer.render(e.scene,this.camera),this.renderer.setRenderTarget(null);let a=S(t);if(!a)throw Error(`Unsupported GPU toolpath theme colour: `+t);this.compositeMaterial.uniforms.stroke.value.setRGB(a.r/255,a.g/255,a.b/255),this.compositeMaterial.uniforms.alpha.value=r*a.a,this.renderer.render(this.compositeScene,this.camera)}render(e,t,n,r,i,a,o=!1){if(this.retain(e.map(e=>e.toolpath)),this.disposed||this.lost||this.renderer.getContext().isContextLost()||n<=0||r<=0)return!1;(this.viewport.x!==n||this.viewport.y!==r)&&(this.renderer.setSize(n,r,!1),this.mask.setSize(n,r)),this.view.set(t.scale,t.offsetX,t.offsetY),this.viewport.set(n,r),this.renderer.setRenderTarget(null),this.renderer.clear();let s=b(a);for(let{toolpath:c,emphasized:l,slotScale:u}of e){let e=this.prepare(c,u),d=i.feedColours??(l&&x(c));for(let t of m(i)){if(!t.visible)continue;let n=s[t.key],r=g(n.lineWidth,l),i=l?1:.34;if(t.key===`cuts`&&d)for(let[t,n]of e.feeds)this.paint(n,h(t,a),r,i);else this.paint(e.layers[t.key],n.stroke,r,i,n.dash.length>0)}this.paint(e.collisions,a.toolpathCollision,l?3:2.2,l?1:.55),this.annotations.render(this.renderer,this.camera,c,l,t,n,r,i,a,o)}return this.canvas.hidden=!1,!0}retain(e){let t=new Set(e);for(let[e,n]of this.cache)t.has(e)||(this.release(n),this.cache.delete(e));this.annotations.retain(t)}release(e){for(let t of[...Object.values(e.layers),...e.feeds.values(),e.collisions]){for(let e of t.geometries)e.dispose();t.scene.clear()}}dispose(){if(!this.disposed){this.disposed=!0,this.canvas.removeEventListener(`webglcontextlost`,this.onLoss),this.canvas.removeEventListener(`webglcontextrestored`,this.onRestore);for(let e of this.cache.values())this.release(e);this.cache.clear(),this.annotations.dispose(),this.mask.dispose(),this.maskMaterial.dispose(),this.compositeMaterial.dispose(),this.quadGeometry.dispose(),this.renderer.dispose(),this.renderer.forceContextLoss()}}};export{O as GpuToolpathRenderer};