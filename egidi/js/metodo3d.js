// metodo3d 4.0.0 · three 0.186.1 (MIT, vedi LICENSE-three.txt) · sourceHash 0a2e2c96dd249aa054f6d5457747382b6e831f1781dd8f4b85ed868a28296f46
var Cm=Object.defineProperty;var Pm=(n,e)=>{for(var t in e)Cm(n,t,{get:e[t],enumerable:!0})};var Wo="186";var kc=0,Cl=1,Wc=2;var Yn=1,Xc=2,_r=3,Xi=0,Rt=1,wi=2,Bi=0,Zn=1,Xo=2,Pl=3,Ll=4,qc=5;var Kn=100,Yc=101,Zc=102,Kc=103,Jc=104,$c=200,Qc=201,jc=202,ef=203,sa=204,aa=205,tf=206,nf=207,rf=208,of=209,sf=210,af=211,lf=212,cf=213,ff=214,qo=0,Yo=1,Zo=2,Jn=3,Ko=4,Jo=5,$o=6,Qo=7,kr=0,uf=1,hf=2,Ri=0,la=1,ca=2,fa=3,Wr=4,ua=5,ha=6,da=7;var Dl=300,qi=301,Rn=302,pa=303,ma=304,$n=306,xr=1e3,di=1001,jo=1002,Ut=1003,df=1004;var es=1005;var Bt=1006,ga=1007;var rn=1008;var Qt=1009,_a=1010,xa=1011,Cn=1012,Xr=1013,pi=1014,Kt=1015,jt=1016,qr=1017,Yr=1018,Mr=1020,Ma=35902,va=35899,Sa=1021,ya=1022,Ci=1023,Gi=1026,Pn=1027,Zr=1028,Kr=1029,zi=1030,Jr=1031;var $r=1033,Qr=33776,jr=33777,eo=33778,to=33779,ts=35840,is=35841,ns=35842,rs=35843,os=36196,ss=37492,as=37496,ls=37488,cs=37489,vr=37490,fs=37491,us=37808,hs=37809,ds=37810,ps=37811,ms=37812,gs=37813,_s=37814,xs=37815,Ms=37816,vs=37817,Ss=37818,ys=37819,Es=37820,bs=37821,Ts=36492,As=36494,ws=36495,Rs=36283,Cs=36284,Sr=36285,Ps=36286;var pf=3200;var yr=0,mf=1,Yi="",ei="srgb",Er="srgb-linear",br="linear",st="srgb";var Ea=7680;var gf=519,_f=512,xf=513,Mf=514,io=515,vf=516,Sf=517,no=518,yf=519,Ef=35044;var Il="300 es",Pi=2e3,Ln=2001;function Tf(n){for(let e=n.length-1;e>=0;--e)if(n[e]>=65535)return!0;return!1}function oo(n){return document.createElementNS("http://www.w3.org/1999/xhtml",n)}function Af(){let n=oo("canvas");return n.style.display="block",n}var bf={},ro=null;function Fl(...n){let e="THREE."+n.shift();ro?ro("log",e,...n):console.log(e,...n)}function wf(n){let e=n[0];if(typeof e=="string"&&e.startsWith("TSL:")){let t=n[1];t&&t.isStackTrace?n[0]+=" "+t.getLocation():n[1]='Stack trace not available. Enable "THREE.Node.captureStackTrace" to capture stack traces.'}return n}function Re(...n){n=wf(n);let e="THREE."+n.shift();if(ro)ro("warn",e,...n);else{let t=n[0];t&&t.isStackTrace?console.warn(t.getError(e)):console.warn(e,...n)}}function Qe(...n){n=wf(n);let e="THREE."+n.shift();if(ro)ro("error",e,...n);else{let t=n[0];t&&t.isStackTrace?console.error(t.getError(e)):console.error(e,...n)}}function xn(...n){let e=n.join(" ");e in bf||(bf[e]=!0,Re(...n))}function Rf(n,e,t){return new Promise(function(i,r){function o(){switch(n.clientWaitSync(e,n.SYNC_FLUSH_COMMANDS_BIT,0)){case n.WAIT_FAILED:r();break;case n.TIMEOUT_EXPIRED:setTimeout(o,t);break;default:i()}}setTimeout(o,t)})}var Cf={[qo]:Yo,[Zo]:$o,[Ko]:Qo,[Jn]:Jo,[Yo]:qo,[$o]:Zo,[Qo]:Ko,[Jo]:Jn};var mi=class{addEventListener(e,t){this._listeners===void 0&&(this._listeners={});let i=this._listeners;i[e]===void 0&&(i[e]=[]),i[e].indexOf(t)===-1&&i[e].push(t)}hasEventListener(e,t){let i=this._listeners;return i===void 0?!1:i[e]!==void 0&&i[e].indexOf(t)!==-1}removeEventListener(e,t){let i=this._listeners;if(i===void 0)return;let r=i[e];if(r!==void 0){let o=r.indexOf(t);o!==-1&&r.splice(o,1)}}dispatchEvent(e){let t=this._listeners;if(t===void 0)return;let i=t[e.type];if(i!==void 0){e.target=this;let r=i.slice(0);for(let o=0,s=r.length;o<s;o++)r[o].call(this,e);e.target=null}}};var gi=["00","01","02","03","04","05","06","07","08","09","0a","0b","0c","0d","0e","0f","10","11","12","13","14","15","16","17","18","19","1a","1b","1c","1d","1e","1f","20","21","22","23","24","25","26","27","28","29","2a","2b","2c","2d","2e","2f","30","31","32","33","34","35","36","37","38","39","3a","3b","3c","3d","3e","3f","40","41","42","43","44","45","46","47","48","49","4a","4b","4c","4d","4e","4f","50","51","52","53","54","55","56","57","58","59","5a","5b","5c","5d","5e","5f","60","61","62","63","64","65","66","67","68","69","6a","6b","6c","6d","6e","6f","70","71","72","73","74","75","76","77","78","79","7a","7b","7c","7d","7e","7f","80","81","82","83","84","85","86","87","88","89","8a","8b","8c","8d","8e","8f","90","91","92","93","94","95","96","97","98","99","9a","9b","9c","9d","9e","9f","a0","a1","a2","a3","a4","a5","a6","a7","a8","a9","aa","ab","ac","ad","ae","af","b0","b1","b2","b3","b4","b5","b6","b7","b8","b9","ba","bb","bc","bd","be","bf","c0","c1","c2","c3","c4","c5","c6","c7","c8","c9","ca","cb","cc","cd","ce","cf","d0","d1","d2","d3","d4","d5","d6","d7","d8","d9","da","db","dc","dd","de","df","e0","e1","e2","e3","e4","e5","e6","e7","e8","e9","ea","eb","ec","ed","ee","ef","f0","f1","f2","f3","f4","f5","f6","f7","f8","f9","fa","fb","fc","fd","fe","ff"];var ba=Math.PI/180,Ls=180/Math.PI;function Mn(){let n=Math.random()*4294967295|0,e=Math.random()*4294967295|0,t=Math.random()*4294967295|0,i=Math.random()*4294967295|0;return(gi[n&255]+gi[n>>8&255]+gi[n>>16&255]+gi[n>>24&255]+"-"+gi[e&255]+gi[e>>8&255]+"-"+gi[e>>16&15|64]+gi[e>>24&255]+"-"+gi[t&63|128]+gi[t>>8&255]+"-"+gi[t>>16&255]+gi[t>>24&255]+gi[i&255]+gi[i>>8&255]+gi[i>>16&255]+gi[i>>24&255]).toLowerCase()}function qe(n,e,t){return Math.max(e,Math.min(t,n))}function Pf(n,e){return(n%e+e)%e}function Ta(n,e,t){return(1-t)*n+t*e}function so(n,e){switch(e.constructor){case Float32Array:return n;case Uint32Array:return n/4294967295;case Uint16Array:return n/65535;case Uint8Array:case Uint8ClampedArray:return n/255;case Int32Array:return Math.max(n/2147483647,-1);case Int16Array:return Math.max(n/32767,-1);case Int8Array:return Math.max(n/127,-1);default:throw new Error("THREE.MathUtils: Invalid component type.")}}function Li(n,e){switch(e.constructor){case Float32Array:return n;case Uint32Array:return Math.round(n*4294967295);case Uint16Array:return Math.round(n*65535);case Uint8Array:case Uint8ClampedArray:return Math.round(n*255);case Int32Array:return Math.round(n*2147483647);case Int16Array:return Math.round(n*32767);case Int8Array:return Math.round(n*127);default:throw new Error("THREE.MathUtils: Invalid component type.")}}var Ul=class Ul{constructor(e=0,t=0){this.x=e,this.y=t}get width(){return this.x}set width(e){this.x=e}get height(){return this.y}set height(e){this.y=e}set(e,t){return this.x=e,this.y=t,this}setScalar(e){return this.x=e,this.y=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;default:throw new Error("THREE.Vector2: index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;default:throw new Error("THREE.Vector2: index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y)}copy(e){return this.x=e.x,this.y=e.y,this}add(e){return this.x+=e.x,this.y+=e.y,this}addScalar(e){return this.x+=e,this.y+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this}subScalar(e){return this.x-=e,this.y-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this}multiply(e){return this.x*=e.x,this.y*=e.y,this}multiplyScalar(e){return this.x*=e,this.y*=e,this}divide(e){return this.x/=e.x,this.y/=e.y,this}divideScalar(e){return this.multiplyScalar(1/e)}applyMatrix3(e){let t=this.x,i=this.y,r=e.elements;return this.x=r[0]*t+r[3]*i+r[6],this.y=r[1]*t+r[4]*i+r[7],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this}clamp(e,t){return this.x=qe(this.x,e.x,t.x),this.y=qe(this.y,e.y,t.y),this}clampScalar(e,t){return this.x=qe(this.x,e,t),this.y=qe(this.y,e,t),this}clampLength(e,t){let i=this.length();return this.divideScalar(i||1).multiplyScalar(qe(i,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(e){return this.x*e.x+this.y*e.y}cross(e){return this.x*e.y-this.y*e.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(e){let t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;let i=this.dot(e)/t;return Math.acos(qe(i,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){let t=this.x-e.x,i=this.y-e.y;return t*t+i*i}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this}lerpVectors(e,t,i){return this.x=e.x+(t.x-e.x)*i,this.y=e.y+(t.y-e.y)*i,this}equals(e){return e.x===this.x&&e.y===this.y}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this}rotateAround(e,t){let i=Math.cos(t),r=Math.sin(t),o=this.x-e.x,s=this.y-e.y;return this.x=o*i-s*r+e.x,this.y=o*r+s*i+e.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}};Ul.prototype.isVector2=!0;var Ne=Ul;var Zi=class{constructor(e=0,t=0,i=0,r=1){this.isQuaternion=!0,this._x=e,this._y=t,this._z=i,this._w=r}static slerpFlat(e,t,i,r,o,s,a){let c=i[r+0],l=i[r+1],f=i[r+2],h=i[r+3],u=o[s+0],d=o[s+1],_=o[s+2],v=o[s+3];if(h!==v||c!==u||l!==d||f!==_){let m=c*u+l*d+f*_+h*v;m<0&&(u=-u,d=-d,_=-_,v=-v,m=-m);let p=1-a;if(m<.9995){let E=Math.acos(m),C=Math.sin(E);p=Math.sin(p*E)/C,a=Math.sin(a*E)/C,c=c*p+u*a,l=l*p+d*a,f=f*p+_*a,h=h*p+v*a}else{c=c*p+u*a,l=l*p+d*a,f=f*p+_*a,h=h*p+v*a;let E=1/Math.sqrt(c*c+l*l+f*f+h*h);c*=E,l*=E,f*=E,h*=E}}e[t]=c,e[t+1]=l,e[t+2]=f,e[t+3]=h}static multiplyQuaternionsFlat(e,t,i,r,o,s){let a=i[r],c=i[r+1],l=i[r+2],f=i[r+3],h=o[s],u=o[s+1],d=o[s+2],_=o[s+3];return e[t]=a*_+f*h+c*d-l*u,e[t+1]=c*_+f*u+l*h-a*d,e[t+2]=l*_+f*d+a*u-c*h,e[t+3]=f*_-a*h-c*u-l*d,e}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get w(){return this._w}set w(e){this._w=e,this._onChangeCallback()}set(e,t,i,r){return this._x=e,this._y=t,this._z=i,this._w=r,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(e){return this._x=e.x,this._y=e.y,this._z=e.z,this._w=e.w,this._onChangeCallback(),this}setFromEuler(e,t=!0){let i=e._x,r=e._y,o=e._z,s=e._order,a=Math.cos,c=Math.sin,l=a(i/2),f=a(r/2),h=a(o/2),u=c(i/2),d=c(r/2),_=c(o/2);switch(s){case"XYZ":this._x=u*f*h+l*d*_,this._y=l*d*h-u*f*_,this._z=l*f*_+u*d*h,this._w=l*f*h-u*d*_;break;case"YXZ":this._x=u*f*h+l*d*_,this._y=l*d*h-u*f*_,this._z=l*f*_-u*d*h,this._w=l*f*h+u*d*_;break;case"ZXY":this._x=u*f*h-l*d*_,this._y=l*d*h+u*f*_,this._z=l*f*_+u*d*h,this._w=l*f*h-u*d*_;break;case"ZYX":this._x=u*f*h-l*d*_,this._y=l*d*h+u*f*_,this._z=l*f*_-u*d*h,this._w=l*f*h+u*d*_;break;case"YZX":this._x=u*f*h+l*d*_,this._y=l*d*h+u*f*_,this._z=l*f*_-u*d*h,this._w=l*f*h-u*d*_;break;case"XZY":this._x=u*f*h-l*d*_,this._y=l*d*h-u*f*_,this._z=l*f*_+u*d*h,this._w=l*f*h+u*d*_;break;default:Re("Quaternion: .setFromEuler() encountered an unknown order: "+s)}return t===!0&&this._onChangeCallback(),this}setFromAxisAngle(e,t){let i=t/2,r=Math.sin(i);return this._x=e.x*r,this._y=e.y*r,this._z=e.z*r,this._w=Math.cos(i),this._onChangeCallback(),this}setFromRotationMatrix(e){let t=e.elements,i=t[0],r=t[4],o=t[8],s=t[1],a=t[5],c=t[9],l=t[2],f=t[6],h=t[10],u=i+a+h;if(u>0){let d=.5/Math.sqrt(u+1);this._w=.25/d,this._x=(f-c)*d,this._y=(o-l)*d,this._z=(s-r)*d}else if(i>a&&i>h){let d=2*Math.sqrt(1+i-a-h);this._w=(f-c)/d,this._x=.25*d,this._y=(r+s)/d,this._z=(o+l)/d}else if(a>h){let d=2*Math.sqrt(1+a-i-h);this._w=(o-l)/d,this._x=(r+s)/d,this._y=.25*d,this._z=(c+f)/d}else{let d=2*Math.sqrt(1+h-i-a);this._w=(s-r)/d,this._x=(o+l)/d,this._y=(c+f)/d,this._z=.25*d}return this._onChangeCallback(),this}setFromUnitVectors(e,t){let i=e.dot(t)+1;return i<1e-8?(i=0,Math.abs(e.x)>Math.abs(e.z)?(this._x=-e.y,this._y=e.x,this._z=0,this._w=i):(this._x=0,this._y=-e.z,this._z=e.y,this._w=i)):(this._x=e.y*t.z-e.z*t.y,this._y=e.z*t.x-e.x*t.z,this._z=e.x*t.y-e.y*t.x,this._w=i),this.normalize()}angleTo(e){return 2*Math.acos(Math.abs(qe(this.dot(e),-1,1)))}rotateTowards(e,t){let i=this.angleTo(e);if(i===0)return this;let r=Math.min(1,t/i);return this.slerp(e,r),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(e){return this._x*e._x+this._y*e._y+this._z*e._z+this._w*e._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let e=this.length();return e===0?(this._x=0,this._y=0,this._z=0,this._w=1):(e=1/e,this._x=this._x*e,this._y=this._y*e,this._z=this._z*e,this._w=this._w*e),this._onChangeCallback(),this}multiply(e){return this.multiplyQuaternions(this,e)}premultiply(e){return this.multiplyQuaternions(e,this)}multiplyQuaternions(e,t){let i=e._x,r=e._y,o=e._z,s=e._w,a=t._x,c=t._y,l=t._z,f=t._w;return this._x=i*f+s*a+r*l-o*c,this._y=r*f+s*c+o*a-i*l,this._z=o*f+s*l+i*c-r*a,this._w=s*f-i*a-r*c-o*l,this._onChangeCallback(),this}slerp(e,t){let i=e._x,r=e._y,o=e._z,s=e._w,a=this.dot(e);a<0&&(i=-i,r=-r,o=-o,s=-s,a=-a);let c=1-t;if(a<.9995){let l=Math.acos(a),f=Math.sin(l);c=Math.sin(c*l)/f,t=Math.sin(t*l)/f,this._x=this._x*c+i*t,this._y=this._y*c+r*t,this._z=this._z*c+o*t,this._w=this._w*c+s*t,this._onChangeCallback()}else this._x=this._x*c+i*t,this._y=this._y*c+r*t,this._z=this._z*c+o*t,this._w=this._w*c+s*t,this.normalize();return this}slerpQuaternions(e,t,i){return this.copy(e).slerp(t,i)}random(){let e=2*Math.PI*Math.random(),t=2*Math.PI*Math.random(),i=Math.random(),r=Math.sqrt(1-i),o=Math.sqrt(i);return this.set(r*Math.sin(e),r*Math.cos(e),o*Math.sin(t),o*Math.cos(t))}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._w===this._w}fromArray(e,t=0){return this._x=e[t],this._y=e[t+1],this._z=e[t+2],this._w=e[t+3],this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._w,e}fromBufferAttribute(e,t){return this._x=e.getX(t),this._y=e.getY(t),this._z=e.getZ(t),this._w=e.getW(t),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}};var Ol=class Ol{constructor(e=0,t=0,i=0){this.x=e,this.y=t,this.z=i}set(e,t,i){return i===void 0&&(i=this.z),this.x=e,this.y=t,this.z=i,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;default:throw new Error("THREE.Vector3: index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw new Error("THREE.Vector3: index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this}multiplyVectors(e,t){return this.x=e.x*t.x,this.y=e.y*t.y,this.z=e.z*t.z,this}applyEuler(e){return this.applyQuaternion(Lf.setFromEuler(e))}applyAxisAngle(e,t){return this.applyQuaternion(Lf.setFromAxisAngle(e,t))}applyMatrix3(e){let t=this.x,i=this.y,r=this.z,o=e.elements;return this.x=o[0]*t+o[3]*i+o[6]*r,this.y=o[1]*t+o[4]*i+o[7]*r,this.z=o[2]*t+o[5]*i+o[8]*r,this}applyNormalMatrix(e){return this.applyMatrix3(e).normalize()}applyMatrix4(e){let t=this.x,i=this.y,r=this.z,o=e.elements,s=1/(o[3]*t+o[7]*i+o[11]*r+o[15]);return this.x=(o[0]*t+o[4]*i+o[8]*r+o[12])*s,this.y=(o[1]*t+o[5]*i+o[9]*r+o[13])*s,this.z=(o[2]*t+o[6]*i+o[10]*r+o[14])*s,this}applyQuaternion(e){let t=this.x,i=this.y,r=this.z,o=e.x,s=e.y,a=e.z,c=e.w,l=2*(s*r-a*i),f=2*(a*t-o*r),h=2*(o*i-s*t);return this.x=t+c*l+s*h-a*f,this.y=i+c*f+a*l-o*h,this.z=r+c*h+o*f-s*l,this}project(e){return this.applyMatrix4(e.matrixWorldInverse).applyMatrix4(e.projectionMatrix)}unproject(e){return this.applyMatrix4(e.projectionMatrixInverse).applyMatrix4(e.matrixWorld)}transformDirection(e){let t=this.x,i=this.y,r=this.z,o=e.elements;return this.x=o[0]*t+o[4]*i+o[8]*r,this.y=o[1]*t+o[5]*i+o[9]*r,this.z=o[2]*t+o[6]*i+o[10]*r,this.normalize()}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this}divideScalar(e){return this.multiplyScalar(1/e)}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this}clamp(e,t){return this.x=qe(this.x,e.x,t.x),this.y=qe(this.y,e.y,t.y),this.z=qe(this.z,e.z,t.z),this}clampScalar(e,t){return this.x=qe(this.x,e,t),this.y=qe(this.y,e,t),this.z=qe(this.z,e,t),this}clampLength(e,t){let i=this.length();return this.divideScalar(i||1).multiplyScalar(qe(i,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this}lerpVectors(e,t,i){return this.x=e.x+(t.x-e.x)*i,this.y=e.y+(t.y-e.y)*i,this.z=e.z+(t.z-e.z)*i,this}cross(e){return this.crossVectors(this,e)}crossVectors(e,t){let i=e.x,r=e.y,o=e.z,s=t.x,a=t.y,c=t.z;return this.x=r*c-o*a,this.y=o*s-i*c,this.z=i*a-r*s,this}projectOnVector(e){let t=e.lengthSq();if(t===0)return this.set(0,0,0);let i=e.dot(this)/t;return this.copy(e).multiplyScalar(i)}projectOnPlane(e){return Nl.copy(this).projectOnVector(e),this.sub(Nl)}reflect(e){return this.sub(Nl.copy(e).multiplyScalar(2*this.dot(e)))}angleTo(e){let t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;let i=this.dot(e)/t;return Math.acos(qe(i,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){let t=this.x-e.x,i=this.y-e.y,r=this.z-e.z;return t*t+i*i+r*r}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)+Math.abs(this.z-e.z)}setFromSpherical(e){return this.setFromSphericalCoords(e.radius,e.phi,e.theta)}setFromSphericalCoords(e,t,i){let r=Math.sin(t)*e;return this.x=r*Math.sin(i),this.y=Math.cos(t)*e,this.z=r*Math.cos(i),this}setFromCylindrical(e){return this.setFromCylindricalCoords(e.radius,e.theta,e.y)}setFromCylindricalCoords(e,t,i){return this.x=e*Math.sin(t),this.y=i,this.z=e*Math.cos(t),this}setFromMatrixPosition(e){let t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this}setFromMatrixScale(e){let t=this.setFromMatrixColumn(e,0).length(),i=this.setFromMatrixColumn(e,1).length(),r=this.setFromMatrixColumn(e,2).length();return this.x=t,this.y=i,this.z=r,this}setFromMatrixColumn(e,t){return this.fromArray(e.elements,t*4)}setFromMatrix3Column(e,t){return this.fromArray(e.elements,t*3)}setFromEuler(e){return this.x=e._x,this.y=e._y,this.z=e._z,this}setFromColor(e){return this.x=e.r,this.y=e.g,this.z=e.b,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){let e=Math.random()*Math.PI*2,t=Math.random()*2-1,i=Math.sqrt(1-t*t);return this.x=i*Math.cos(e),this.y=t,this.z=i*Math.sin(e),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}};Ol.prototype.isVector3=!0;var L=Ol,Nl=new L,Lf=new Zi;var Gl=class Gl{constructor(e,t,i,r,o,s,a,c,l){this.elements=[1,0,0,0,1,0,0,0,1],e!==void 0&&this.set(e,t,i,r,o,s,a,c,l)}set(e,t,i,r,o,s,a,c,l){let f=this.elements;return f[0]=e,f[1]=r,f[2]=a,f[3]=t,f[4]=o,f[5]=c,f[6]=i,f[7]=s,f[8]=l,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(e){let t=this.elements,i=e.elements;return t[0]=i[0],t[1]=i[1],t[2]=i[2],t[3]=i[3],t[4]=i[4],t[5]=i[5],t[6]=i[6],t[7]=i[7],t[8]=i[8],this}extractBasis(e,t,i){return e.setFromMatrix3Column(this,0),t.setFromMatrix3Column(this,1),i.setFromMatrix3Column(this,2),this}setFromMatrix4(e){let t=e.elements;return this.set(t[0],t[4],t[8],t[1],t[5],t[9],t[2],t[6],t[10]),this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){let i=e.elements,r=t.elements,o=this.elements,s=i[0],a=i[3],c=i[6],l=i[1],f=i[4],h=i[7],u=i[2],d=i[5],_=i[8],v=r[0],m=r[3],p=r[6],E=r[1],C=r[4],S=r[7],b=r[2],T=r[5],P=r[8];return o[0]=s*v+a*E+c*b,o[3]=s*m+a*C+c*T,o[6]=s*p+a*S+c*P,o[1]=l*v+f*E+h*b,o[4]=l*m+f*C+h*T,o[7]=l*p+f*S+h*P,o[2]=u*v+d*E+_*b,o[5]=u*m+d*C+_*T,o[8]=u*p+d*S+_*P,this}multiplyScalar(e){let t=this.elements;return t[0]*=e,t[3]*=e,t[6]*=e,t[1]*=e,t[4]*=e,t[7]*=e,t[2]*=e,t[5]*=e,t[8]*=e,this}determinant(){let e=this.elements,t=e[0],i=e[1],r=e[2],o=e[3],s=e[4],a=e[5],c=e[6],l=e[7],f=e[8];return t*s*f-t*a*l-i*o*f+i*a*c+r*o*l-r*s*c}invert(){let e=this.elements,t=e[0],i=e[1],r=e[2],o=e[3],s=e[4],a=e[5],c=e[6],l=e[7],f=e[8],h=f*s-a*l,u=a*c-f*o,d=l*o-s*c,_=t*h+i*u+r*d;if(_===0)return this.set(0,0,0,0,0,0,0,0,0);let v=1/_;return e[0]=h*v,e[1]=(r*l-f*i)*v,e[2]=(a*i-r*s)*v,e[3]=u*v,e[4]=(f*t-r*c)*v,e[5]=(r*o-a*t)*v,e[6]=d*v,e[7]=(i*c-l*t)*v,e[8]=(s*t-i*o)*v,this}transpose(){let e,t=this.elements;return e=t[1],t[1]=t[3],t[3]=e,e=t[2],t[2]=t[6],t[6]=e,e=t[5],t[5]=t[7],t[7]=e,this}getNormalMatrix(e){return this.setFromMatrix4(e).invert().transpose()}transposeIntoArray(e){let t=this.elements;return e[0]=t[0],e[1]=t[3],e[2]=t[6],e[3]=t[1],e[4]=t[4],e[5]=t[7],e[6]=t[2],e[7]=t[5],e[8]=t[8],this}setUvTransform(e,t,i,r,o,s,a){let c=Math.cos(o),l=Math.sin(o);return this.set(i*c,i*l,-i*(c*s+l*a)+s+e,-r*l,r*c,-r*(-l*s+c*a)+a+t,0,0,1),this}scale(e,t){return xn("Matrix3: .scale() is deprecated. Use .makeScale() instead."),this.premultiply(Bl.makeScale(e,t)),this}rotate(e){return xn("Matrix3: .rotate() is deprecated. Use .makeRotation() instead."),this.premultiply(Bl.makeRotation(-e)),this}translate(e,t){return xn("Matrix3: .translate() is deprecated. Use .makeTranslation() instead."),this.premultiply(Bl.makeTranslation(e,t)),this}makeTranslation(e,t){return e.isVector2?this.set(1,0,e.x,0,1,e.y,0,0,1):this.set(1,0,e,0,1,t,0,0,1),this}makeRotation(e){let t=Math.cos(e),i=Math.sin(e);return this.set(t,-i,0,i,t,0,0,0,1),this}makeScale(e,t){return this.set(e,0,0,0,t,0,0,0,1),this}equals(e){let t=this.elements,i=e.elements;for(let r=0;r<9;r++)if(t[r]!==i[r])return!1;return!0}fromArray(e,t=0){for(let i=0;i<9;i++)this.elements[i]=e[i+t];return this}toArray(e=[],t=0){let i=this.elements;return e[t]=i[0],e[t+1]=i[1],e[t+2]=i[2],e[t+3]=i[3],e[t+4]=i[4],e[t+5]=i[5],e[t+6]=i[6],e[t+7]=i[7],e[t+8]=i[8],e}clone(){return new this.constructor().fromArray(this.elements)}};Gl.prototype.isMatrix3=!0;var Be=Gl,Bl=new Be;var Df=new Be().set(.4123908,.3575843,.1804808,.212639,.7151687,.0721923,.0193308,.1191948,.9505322),If=new Be().set(3.2409699,-1.5373832,-.4986108,-.9692436,1.8759675,.0415551,.0556301,-.203977,1.0569715);function Lm(){let n={enabled:!0,workingColorSpace:Er,spaces:{},convert:function(r,o,s){return this.enabled===!1||o===s||!o||!s||(this.spaces[o].transfer===st&&(r.r=on(r.r),r.g=on(r.g),r.b=on(r.b)),this.spaces[o].primaries!==this.spaces[s].primaries&&(r.applyMatrix3(this.spaces[o].toXYZ),r.applyMatrix3(this.spaces[s].fromXYZ)),this.spaces[s].transfer===st&&(r.r=Tr(r.r),r.g=Tr(r.g),r.b=Tr(r.b))),r},workingToColorSpace:function(r,o){return this.convert(r,this.workingColorSpace,o)},colorSpaceToWorking:function(r,o){return this.convert(r,o,this.workingColorSpace)},getPrimaries:function(r){return this.spaces[r].primaries},getTransfer:function(r){return r===Yi?br:this.spaces[r].transfer},getToneMappingMode:function(r){return this.spaces[r].outputColorSpaceConfig.toneMappingMode||"standard"},getLuminanceCoefficients:function(r,o=this.workingColorSpace){return r.fromArray(this.spaces[o].luminanceCoefficients)},define:function(r){Object.assign(this.spaces,r)},_getMatrix:function(r,o,s){return r.copy(this.spaces[o].toXYZ).multiply(this.spaces[s].fromXYZ)},_getDrawingBufferColorSpace:function(r){return this.spaces[r].outputColorSpaceConfig.drawingBufferColorSpace},_getUnpackColorSpace:function(r=this.workingColorSpace){return this.spaces[r].workingColorSpaceConfig.unpackColorSpace},fromWorkingColorSpace:function(r,o){return xn("ColorManagement: .fromWorkingColorSpace() has been renamed to .workingToColorSpace()."),n.workingToColorSpace(r,o)},toWorkingColorSpace:function(r,o){return xn("ColorManagement: .toWorkingColorSpace() has been renamed to .colorSpaceToWorking()."),n.colorSpaceToWorking(r,o)}},e=[.64,.33,.3,.6,.15,.06],t=[.2126,.7152,.0722],i=[.3127,.329];return n.define({[Er]:{primaries:e,whitePoint:i,transfer:br,toXYZ:Df,fromXYZ:If,luminanceCoefficients:t,workingColorSpaceConfig:{unpackColorSpace:ei},outputColorSpaceConfig:{drawingBufferColorSpace:ei}},[ei]:{primaries:e,whitePoint:i,transfer:st,toXYZ:Df,fromXYZ:If,luminanceCoefficients:t,outputColorSpaceConfig:{drawingBufferColorSpace:ei}}}),n}var Ye=Lm();function on(n){return n<.04045?n*.0773993808:Math.pow(n*.9478672986+.0521327014,2.4)}function Tr(n){return n<.0031308?n*12.92:1.055*Math.pow(n,.41666)-.055}var ao,Aa=class{static getDataURL(e,t="image/png"){if(/^data:/i.test(e.src)||typeof HTMLCanvasElement>"u")return e.src;let i;if(e instanceof HTMLCanvasElement)i=e;else{ao===void 0&&(ao=oo("canvas")),ao.width=e.width,ao.height=e.height;let r=ao.getContext("2d");e instanceof ImageData?r.putImageData(e,0,0):r.drawImage(e,0,0,e.width,e.height),i=ao}return i.toDataURL(t)}static sRGBToLinear(e){if(typeof HTMLImageElement<"u"&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&e instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&e instanceof ImageBitmap){let t=oo("canvas");t.width=e.width,t.height=e.height;let i=t.getContext("2d");i.drawImage(e,0,0,e.width,e.height);let r=i.getImageData(0,0,e.width,e.height),o=r.data;for(let s=0;s<o.length;s++)o[s]=on(o[s]/255)*255;return i.putImageData(r,0,0),t}else if(e.data){let t=e.data.slice(0);for(let i=0;i<t.length;i++)t instanceof Uint8Array||t instanceof Uint8ClampedArray?t[i]=Math.floor(on(t[i]/255)*255):t[i]=on(t[i]);return{data:t,width:e.width,height:e.height}}else return Re("ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied."),e}};var Dm=0,Qn=class{constructor(e=null){this.isTextureSource=!0,Object.defineProperty(this,"id",{value:Dm++}),this.uuid=Mn(),this.data=e,this.dataReady=!0,this.version=0}getSize(e){let t=this.data;return typeof HTMLVideoElement<"u"&&t instanceof HTMLVideoElement?e.set(t.videoWidth,t.videoHeight,0):typeof VideoFrame<"u"&&t instanceof VideoFrame?e.set(t.displayWidth,t.displayHeight,0):t!==null?e.set(t.width,t.height,t.depth||0):e.set(0,0,0),e}set needsUpdate(e){e===!0&&this.version++}toJSON(e){let t=e===void 0||typeof e=="string";if(!t&&e.images[this.uuid]!==void 0)return e.images[this.uuid];let i={uuid:this.uuid,url:""},r=this.data;if(r!==null){let o;if(Array.isArray(r)){o=[];for(let s=0,a=r.length;s<a;s++)r[s].isDataTexture?o.push(zl(r[s].image)):o.push(zl(r[s]))}else o=zl(r);i.url=o}return t||(e.images[this.uuid]=i),i}};function zl(n){return typeof HTMLImageElement<"u"&&n instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&n instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&n instanceof ImageBitmap?Aa.getDataURL(n):n.data?{data:Array.from(n.data),width:n.width,height:n.height,type:n.data.constructor.name}:(Re("Texture: Unable to serialize Texture."),{})}var Im=0,Vl=new L,kt=class n extends mi{constructor(e=n.DEFAULT_IMAGE,t=n.DEFAULT_MAPPING,i=di,r=di,o=Bt,s=rn,a=Ci,c=Qt,l=n.DEFAULT_ANISOTROPY,f=Yi){super(),this.isTexture=!0,Object.defineProperty(this,"id",{value:Im++}),this.uuid=Mn(),this.name="",this.source=new Qn(e),this.mipmaps=[],this.mapping=t,this.channel=0,this.wrapS=i,this.wrapT=r,this.magFilter=o,this.minFilter=s,this.anisotropy=l,this.format=a,this.internalFormat=null,this.type=c,this.offset=new Ne(0,0),this.repeat=new Ne(1,1),this.center=new Ne(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new Be,this.generateMipmaps=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.colorSpace=f,this.userData={},this.updateRanges=[],this.version=0,this.onUpdate=null,this.renderTarget=null,this.isRenderTargetTexture=!1,this.isArrayTexture=!!(e&&e.depth&&e.depth>1),this.pmremVersion=0,this.normalized=!1}get width(){return this.source.getSize(Vl).x}get height(){return this.source.getSize(Vl).y}get depth(){return this.source.getSize(Vl).z}get image(){return this.source.data}set image(e){this.source.data=e}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}clone(){return new this.constructor().copy(this)}copy(e){return this.name=e.name,this.source=e.source,this.mipmaps=e.mipmaps.slice(0),this.mapping=e.mapping,this.channel=e.channel,this.wrapS=e.wrapS,this.wrapT=e.wrapT,this.magFilter=e.magFilter,this.minFilter=e.minFilter,this.anisotropy=e.anisotropy,this.format=e.format,this.internalFormat=e.internalFormat,this.type=e.type,this.normalized=e.normalized,this.offset.copy(e.offset),this.repeat.copy(e.repeat),this.center.copy(e.center),this.rotation=e.rotation,this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrix.copy(e.matrix),this.generateMipmaps=e.generateMipmaps,this.premultiplyAlpha=e.premultiplyAlpha,this.flipY=e.flipY,this.unpackAlignment=e.unpackAlignment,this.colorSpace=e.colorSpace,this.renderTarget=e.renderTarget,this.isRenderTargetTexture=e.isRenderTargetTexture,this.isArrayTexture=e.isArrayTexture,this.userData=JSON.parse(JSON.stringify(e.userData)),this.needsUpdate=!0,this}setValues(e){for(let t in e){let i=e[t];if(i===void 0){Re(`Texture.setValues(): parameter '${t}' has value of undefined.`);continue}let r=this[t];if(r===void 0){Re(`Texture.setValues(): property '${t}' does not exist.`);continue}r&&i&&r.isVector2&&i.isVector2||r&&i&&r.isVector3&&i.isVector3||r&&i&&r.isMatrix3&&i.isMatrix3?r.copy(i):this[t]=i}}toJSON(e){let t=e===void 0||typeof e=="string";if(!t&&e.textures[this.uuid]!==void 0)return e.textures[this.uuid];let i={metadata:{version:4.7,type:"Texture",generator:"Texture.toJSON"},uuid:this.uuid,name:this.name,image:this.source.toJSON(e).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,normalized:this.normalized,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};return Object.keys(this.userData).length>0&&(i.userData=this.userData),t||(e.textures[this.uuid]=i),i}dispose(){this.dispatchEvent({type:"dispose"})}transformUv(e){if(this.mapping!==Dl)return e;if(e.applyMatrix3(this.matrix),e.x<0||e.x>1)switch(this.wrapS){case xr:e.x=e.x-Math.floor(e.x);break;case di:e.x=e.x<0?0:1;break;case jo:Math.abs(Math.floor(e.x)%2)===1?e.x=Math.ceil(e.x)-e.x:e.x=e.x-Math.floor(e.x);break}if(e.y<0||e.y>1)switch(this.wrapT){case xr:e.y=e.y-Math.floor(e.y);break;case di:e.y=e.y<0?0:1;break;case jo:Math.abs(Math.floor(e.y)%2)===1?e.y=Math.ceil(e.y)-e.y:e.y=e.y-Math.floor(e.y);break}return this.flipY&&(e.y=1-e.y),e}set needsUpdate(e){e===!0&&(this.version++,this.source.needsUpdate=!0)}set needsPMREMUpdate(e){e===!0&&this.pmremVersion++}};kt.DEFAULT_IMAGE=null;kt.DEFAULT_MAPPING=Dl;kt.DEFAULT_ANISOTROPY=1;var Hl=class Hl{constructor(e=0,t=0,i=0,r=1){this.x=e,this.y=t,this.z=i,this.w=r}get width(){return this.z}set width(e){this.z=e}get height(){return this.w}set height(e){this.w=e}set(e,t,i,r){return this.x=e,this.y=t,this.z=i,this.w=r,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this.w=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setW(e){return this.w=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;case 3:this.w=t;break;default:throw new Error("THREE.Vector4: index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw new Error("THREE.Vector4: index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this.w=e.w!==void 0?e.w:1,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this.w+=e.w,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this.w+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this.w=e.w+t.w,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this.w+=e.w*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this.w-=e.w,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this.w-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this.w=e.w-t.w,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this.w*=e.w,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this.w*=e,this}applyMatrix4(e){let t=this.x,i=this.y,r=this.z,o=this.w,s=e.elements;return this.x=s[0]*t+s[4]*i+s[8]*r+s[12]*o,this.y=s[1]*t+s[5]*i+s[9]*r+s[13]*o,this.z=s[2]*t+s[6]*i+s[10]*r+s[14]*o,this.w=s[3]*t+s[7]*i+s[11]*r+s[15]*o,this}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this.w/=e.w,this}divideScalar(e){return this.multiplyScalar(1/e)}setAxisAngleFromQuaternion(e){this.w=2*Math.acos(e.w);let t=Math.sqrt(1-e.w*e.w);return t<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=e.x/t,this.y=e.y/t,this.z=e.z/t),this}setAxisAngleFromRotationMatrix(e){let t,i,r,o,c=e.elements,l=c[0],f=c[4],h=c[8],u=c[1],d=c[5],_=c[9],v=c[2],m=c[6],p=c[10];if(Math.abs(f-u)<.01&&Math.abs(h-v)<.01&&Math.abs(_-m)<.01){if(Math.abs(f+u)<.1&&Math.abs(h+v)<.1&&Math.abs(_+m)<.1&&Math.abs(l+d+p-3)<.1)return this.set(1,0,0,0),this;t=Math.PI;let C=(l+1)/2,S=(d+1)/2,b=(p+1)/2,T=(f+u)/4,P=(h+v)/4,x=(_+m)/4;return C>S&&C>b?C<.01?(i=0,r=.707106781,o=.707106781):(i=Math.sqrt(C),r=T/i,o=P/i):S>b?S<.01?(i=.707106781,r=0,o=.707106781):(r=Math.sqrt(S),i=T/r,o=x/r):b<.01?(i=.707106781,r=.707106781,o=0):(o=Math.sqrt(b),i=P/o,r=x/o),this.set(i,r,o,t),this}let E=Math.sqrt((m-_)*(m-_)+(h-v)*(h-v)+(u-f)*(u-f));return Math.abs(E)<.001&&(E=1),this.x=(m-_)/E,this.y=(h-v)/E,this.z=(u-f)/E,this.w=Math.acos((l+d+p-1)/2),this}setFromMatrixPosition(e){let t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this.w=t[15],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this.w=Math.min(this.w,e.w),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this.w=Math.max(this.w,e.w),this}clamp(e,t){return this.x=qe(this.x,e.x,t.x),this.y=qe(this.y,e.y,t.y),this.z=qe(this.z,e.z,t.z),this.w=qe(this.w,e.w,t.w),this}clampScalar(e,t){return this.x=qe(this.x,e,t),this.y=qe(this.y,e,t),this.z=qe(this.z,e,t),this.w=qe(this.w,e,t),this}clampLength(e,t){let i=this.length();return this.divideScalar(i||1).multiplyScalar(qe(i,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z+this.w*e.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this.w+=(e.w-this.w)*t,this}lerpVectors(e,t,i){return this.x=e.x+(t.x-e.x)*i,this.y=e.y+(t.y-e.y)*i,this.z=e.z+(t.z-e.z)*i,this.w=e.w+(t.w-e.w)*i,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z&&e.w===this.w}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this.w=e[t+3],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e[t+3]=this.w,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this.w=e.getW(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}};Hl.prototype.isVector4=!0;var At=Hl;var wa=class extends mi{constructor(e=1,t=1,i={}){super(),i=Object.assign({generateMipmaps:!1,internalFormat:null,minFilter:Bt,depthBuffer:!0,stencilBuffer:!1,resolveColorBuffer:!0,resolveDepthBuffer:!0,resolveStencilBuffer:!0,storeMultisampledColorBuffer:!0,storeMultisampledDepthBuffer:!0,storeMultisampledStencilBuffer:!0,depthTexture:null,samples:0,count:1,depth:1,multiview:!1,useArrayDepthTexture:!1},i),this.isRenderTarget=!0,this.width=e,this.height=t,this.depth=i.depth,this.scissor=new At(0,0,e,t),this.scissorTest=!1,this.viewport=new At(0,0,e,t),this.textures=[];let r={width:e,height:t,depth:i.depth},o=new kt(r),s=i.count;for(let a=0;a<s;a++)this.textures[a]=o.clone(),this.textures[a].isRenderTargetTexture=!0,this.textures[a].renderTarget=this;this._setTextureOptions(i),this.depthBuffer=i.depthBuffer,this.stencilBuffer=i.stencilBuffer,this.resolveColorBuffer=i.resolveColorBuffer,this.resolveDepthBuffer=i.resolveDepthBuffer,this.resolveStencilBuffer=i.resolveStencilBuffer,this.storeMultisampledColorBuffer=i.storeMultisampledColorBuffer,this.storeMultisampledDepthBuffer=i.storeMultisampledDepthBuffer,this.storeMultisampledStencilBuffer=i.storeMultisampledStencilBuffer,this._depthTexture=null,this.depthTexture=i.depthTexture,this.samples=i.samples,this.multiview=i.multiview,this.useArrayDepthTexture=i.useArrayDepthTexture}_setTextureOptions(e={}){let t={minFilter:Bt,generateMipmaps:!1,flipY:!1,internalFormat:null};e.mapping!==void 0&&(t.mapping=e.mapping),e.wrapS!==void 0&&(t.wrapS=e.wrapS),e.wrapT!==void 0&&(t.wrapT=e.wrapT),e.wrapR!==void 0&&(t.wrapR=e.wrapR),e.magFilter!==void 0&&(t.magFilter=e.magFilter),e.minFilter!==void 0&&(t.minFilter=e.minFilter),e.format!==void 0&&(t.format=e.format),e.type!==void 0&&(t.type=e.type),e.anisotropy!==void 0&&(t.anisotropy=e.anisotropy),e.colorSpace!==void 0&&(t.colorSpace=e.colorSpace),e.flipY!==void 0&&(t.flipY=e.flipY),e.generateMipmaps!==void 0&&(t.generateMipmaps=e.generateMipmaps),e.internalFormat!==void 0&&(t.internalFormat=e.internalFormat);for(let i=0;i<this.textures.length;i++)this.textures[i].setValues(t)}get texture(){return this.textures[0]}set texture(e){this.textures[0]=e}set depthTexture(e){this._depthTexture!==null&&this._depthTexture.renderTarget===this&&(this._depthTexture.renderTarget=null),e!==null&&e.renderTarget===null&&(e.renderTarget=this),this._depthTexture=e}get depthTexture(){return this._depthTexture}setSize(e,t,i=1){if(this.width!==e||this.height!==t||this.depth!==i){this.width=e,this.height=t,this.depth=i;for(let r=0,o=this.textures.length;r<o;r++)this.textures[r].image.width=e,this.textures[r].image.height=t,this.textures[r].image.depth=i,this.textures[r].isData3DTexture!==!0&&(this.textures[r].isArrayTexture=this.textures[r].image.depth>1);this.dispose()}this.viewport.set(0,0,e,t),this.scissor.set(0,0,e,t)}clone(){return new this.constructor().copy(this)}copy(e){this.width=e.width,this.height=e.height,this.depth=e.depth,this.scissor.copy(e.scissor),this.scissorTest=e.scissorTest,this.viewport.copy(e.viewport),this.textures.length=0;for(let t=0,i=e.textures.length;t<i;t++){this.textures[t]=e.textures[t].clone(),this.textures[t].isRenderTargetTexture=!0,this.textures[t].renderTarget=this;let r=Object.assign({},e.textures[t].image);this.textures[t].source=new Qn(r)}if(this.depthBuffer=e.depthBuffer,this.stencilBuffer=e.stencilBuffer,this.resolveColorBuffer=e.resolveColorBuffer,this.resolveDepthBuffer=e.resolveDepthBuffer,this.resolveStencilBuffer=e.resolveStencilBuffer,this.storeMultisampledColorBuffer=e.storeMultisampledColorBuffer,this.storeMultisampledDepthBuffer=e.storeMultisampledDepthBuffer,this.storeMultisampledStencilBuffer=e.storeMultisampledStencilBuffer,e.depthTexture!==null)if(e.depthTexture.renderTarget===e){let t=e.depthTexture.clone();t.renderTarget=null,this.depthTexture=t}else this.depthTexture=e.depthTexture;return this.samples=e.samples,this.multiview=e.multiview,this.useArrayDepthTexture=e.useArrayDepthTexture,this}dispose(){this.dispatchEvent({type:"dispose"})}};var _i=class extends wa{constructor(e=1,t=1,i={}){super(e,t,i),this.isWebGLRenderTarget=!0}};var lo=class extends kt{constructor(e=null,t=1,i=1,r=1){super(null),this.isDataArrayTexture=!0,this.image={data:e,width:t,height:i,depth:r},this.magFilter=Ut,this.minFilter=Ut,this.wrapR=di,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1,this.layerUpdates=new Set}copy(e){return super.copy(e),this.wrapR=e.wrapR,this}addLayerUpdate(e){this.layerUpdates.add(e)}clearLayerUpdates(){this.layerUpdates.clear()}};var Ra=class extends kt{constructor(e=null,t=1,i=1,r=1){super(null),this.isData3DTexture=!0,this.image={data:e,width:t,height:i,depth:r},this.magFilter=Ut,this.minFilter=Ut,this.wrapR=di,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}copy(e){return super.copy(e),this.wrapR=e.wrapR,this}};var Pa=class Pa{constructor(e,t,i,r,o,s,a,c,l,f,h,u,d,_,v,m){this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],e!==void 0&&this.set(e,t,i,r,o,s,a,c,l,f,h,u,d,_,v,m)}set(e,t,i,r,o,s,a,c,l,f,h,u,d,_,v,m){let p=this.elements;return p[0]=e,p[4]=t,p[8]=i,p[12]=r,p[1]=o,p[5]=s,p[9]=a,p[13]=c,p[2]=l,p[6]=f,p[10]=h,p[14]=u,p[3]=d,p[7]=_,p[11]=v,p[15]=m,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new Pa().fromArray(this.elements)}copy(e){let t=this.elements,i=e.elements;return t[0]=i[0],t[1]=i[1],t[2]=i[2],t[3]=i[3],t[4]=i[4],t[5]=i[5],t[6]=i[6],t[7]=i[7],t[8]=i[8],t[9]=i[9],t[10]=i[10],t[11]=i[11],t[12]=i[12],t[13]=i[13],t[14]=i[14],t[15]=i[15],this}copyPosition(e){let t=this.elements,i=e.elements;return t[12]=i[12],t[13]=i[13],t[14]=i[14],this}setFromMatrix3(e){let t=e.elements;return this.set(t[0],t[3],t[6],0,t[1],t[4],t[7],0,t[2],t[5],t[8],0,0,0,0,1),this}extractBasis(e,t,i){return this.determinantAffine()===0?(e.set(1,0,0),t.set(0,1,0),i.set(0,0,1),this):(e.setFromMatrixColumn(this,0),t.setFromMatrixColumn(this,1),i.setFromMatrixColumn(this,2),this)}makeBasis(e,t,i){return this.set(e.x,t.x,i.x,0,e.y,t.y,i.y,0,e.z,t.z,i.z,0,0,0,0,1),this}extractRotation(e){if(e.determinantAffine()===0)return this.identity();let t=this.elements,i=e.elements,r=1/co.setFromMatrixColumn(e,0).length(),o=1/co.setFromMatrixColumn(e,1).length(),s=1/co.setFromMatrixColumn(e,2).length();return t[0]=i[0]*r,t[1]=i[1]*r,t[2]=i[2]*r,t[3]=0,t[4]=i[4]*o,t[5]=i[5]*o,t[6]=i[6]*o,t[7]=0,t[8]=i[8]*s,t[9]=i[9]*s,t[10]=i[10]*s,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromEuler(e){let t=this.elements,i=e.x,r=e.y,o=e.z,s=Math.cos(i),a=Math.sin(i),c=Math.cos(r),l=Math.sin(r),f=Math.cos(o),h=Math.sin(o);if(e.order==="XYZ"){let u=s*f,d=s*h,_=a*f,v=a*h;t[0]=c*f,t[4]=-c*h,t[8]=l,t[1]=d+_*l,t[5]=u-v*l,t[9]=-a*c,t[2]=v-u*l,t[6]=_+d*l,t[10]=s*c}else if(e.order==="YXZ"){let u=c*f,d=c*h,_=l*f,v=l*h;t[0]=u+v*a,t[4]=_*a-d,t[8]=s*l,t[1]=s*h,t[5]=s*f,t[9]=-a,t[2]=d*a-_,t[6]=v+u*a,t[10]=s*c}else if(e.order==="ZXY"){let u=c*f,d=c*h,_=l*f,v=l*h;t[0]=u-v*a,t[4]=-s*h,t[8]=_+d*a,t[1]=d+_*a,t[5]=s*f,t[9]=v-u*a,t[2]=-s*l,t[6]=a,t[10]=s*c}else if(e.order==="ZYX"){let u=s*f,d=s*h,_=a*f,v=a*h;t[0]=c*f,t[4]=_*l-d,t[8]=u*l+v,t[1]=c*h,t[5]=v*l+u,t[9]=d*l-_,t[2]=-l,t[6]=a*c,t[10]=s*c}else if(e.order==="YZX"){let u=s*c,d=s*l,_=a*c,v=a*l;t[0]=c*f,t[4]=v-u*h,t[8]=_*h+d,t[1]=h,t[5]=s*f,t[9]=-a*f,t[2]=-l*f,t[6]=d*h+_,t[10]=u-v*h}else if(e.order==="XZY"){let u=s*c,d=s*l,_=a*c,v=a*l;t[0]=c*f,t[4]=-h,t[8]=l*f,t[1]=u*h+v,t[5]=s*f,t[9]=d*h-_,t[2]=_*h-d,t[6]=a*f,t[10]=v*h+u}return t[3]=0,t[7]=0,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromQuaternion(e){return this.compose(Fm,e,Um)}lookAt(e,t,i){let r=this.elements;return Vi.subVectors(e,t),Vi.lengthSq()===0&&(Vi.z=1),Vi.normalize(),jn.crossVectors(i,Vi),jn.lengthSq()===0&&(Math.abs(i.z)===1?Vi.x+=1e-4:Vi.z+=1e-4,Vi.normalize(),jn.crossVectors(i,Vi)),jn.normalize(),Ca.crossVectors(Vi,jn),r[0]=jn.x,r[4]=Ca.x,r[8]=Vi.x,r[1]=jn.y,r[5]=Ca.y,r[9]=Vi.y,r[2]=jn.z,r[6]=Ca.z,r[10]=Vi.z,this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){let i=e.elements,r=t.elements,o=this.elements,s=i[0],a=i[4],c=i[8],l=i[12],f=i[1],h=i[5],u=i[9],d=i[13],_=i[2],v=i[6],m=i[10],p=i[14],E=i[3],C=i[7],S=i[11],b=i[15],T=r[0],P=r[4],x=r[8],A=r[12],D=r[1],G=r[5],z=r[9],Y=r[13],N=r[2],F=r[6],te=r[10],$=r[14],ae=r[3],j=r[7],re=r[11],oe=r[15];return o[0]=s*T+a*D+c*N+l*ae,o[4]=s*P+a*G+c*F+l*j,o[8]=s*x+a*z+c*te+l*re,o[12]=s*A+a*Y+c*$+l*oe,o[1]=f*T+h*D+u*N+d*ae,o[5]=f*P+h*G+u*F+d*j,o[9]=f*x+h*z+u*te+d*re,o[13]=f*A+h*Y+u*$+d*oe,o[2]=_*T+v*D+m*N+p*ae,o[6]=_*P+v*G+m*F+p*j,o[10]=_*x+v*z+m*te+p*re,o[14]=_*A+v*Y+m*$+p*oe,o[3]=E*T+C*D+S*N+b*ae,o[7]=E*P+C*G+S*F+b*j,o[11]=E*x+C*z+S*te+b*re,o[15]=E*A+C*Y+S*$+b*oe,this}multiplyScalar(e){let t=this.elements;return t[0]*=e,t[4]*=e,t[8]*=e,t[12]*=e,t[1]*=e,t[5]*=e,t[9]*=e,t[13]*=e,t[2]*=e,t[6]*=e,t[10]*=e,t[14]*=e,t[3]*=e,t[7]*=e,t[11]*=e,t[15]*=e,this}determinant(){let e=this.elements,t=e[0],i=e[4],r=e[8],o=e[12],s=e[1],a=e[5],c=e[9],l=e[13],f=e[2],h=e[6],u=e[10],d=e[14],_=e[3],v=e[7],m=e[11],p=e[15],E=c*d-l*u,C=a*d-l*h,S=a*u-c*h,b=s*d-l*f,T=s*u-c*f,P=s*h-a*f;return t*(v*E-m*C+p*S)-i*(_*E-m*b+p*T)+r*(_*C-v*b+p*P)-o*(_*S-v*T+m*P)}determinantAffine(){let e=this.elements,t=e[0],i=e[4],r=e[8],o=e[1],s=e[5],a=e[9],c=e[2],l=e[6],f=e[10];return t*(s*f-a*l)-i*(o*f-a*c)+r*(o*l-s*c)}transpose(){let e=this.elements,t;return t=e[1],e[1]=e[4],e[4]=t,t=e[2],e[2]=e[8],e[8]=t,t=e[6],e[6]=e[9],e[9]=t,t=e[3],e[3]=e[12],e[12]=t,t=e[7],e[7]=e[13],e[13]=t,t=e[11],e[11]=e[14],e[14]=t,this}setPosition(e,t,i){let r=this.elements;return e.isVector3?(r[12]=e.x,r[13]=e.y,r[14]=e.z):(r[12]=e,r[13]=t,r[14]=i),this}invert(){let e=this.elements,t=e[0],i=e[1],r=e[2],o=e[3],s=e[4],a=e[5],c=e[6],l=e[7],f=e[8],h=e[9],u=e[10],d=e[11],_=e[12],v=e[13],m=e[14],p=e[15],E=t*a-i*s,C=t*c-r*s,S=t*l-o*s,b=i*c-r*a,T=i*l-o*a,P=r*l-o*c,x=f*v-h*_,A=f*m-u*_,D=f*p-d*_,G=h*m-u*v,z=h*p-d*v,Y=u*p-d*m,N=E*Y-C*z+S*G+b*D-T*A+P*x;if(N===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);let F=1/N;return e[0]=(a*Y-c*z+l*G)*F,e[1]=(r*z-i*Y-o*G)*F,e[2]=(v*P-m*T+p*b)*F,e[3]=(u*T-h*P-d*b)*F,e[4]=(c*D-s*Y-l*A)*F,e[5]=(t*Y-r*D+o*A)*F,e[6]=(m*S-_*P-p*C)*F,e[7]=(f*P-u*S+d*C)*F,e[8]=(s*z-a*D+l*x)*F,e[9]=(i*D-t*z-o*x)*F,e[10]=(_*T-v*S+p*E)*F,e[11]=(h*S-f*T-d*E)*F,e[12]=(a*A-s*G-c*x)*F,e[13]=(t*G-i*A+r*x)*F,e[14]=(v*C-_*b-m*E)*F,e[15]=(f*b-h*C+u*E)*F,this}scale(e){let t=this.elements,i=e.x,r=e.y,o=e.z;return t[0]*=i,t[4]*=r,t[8]*=o,t[1]*=i,t[5]*=r,t[9]*=o,t[2]*=i,t[6]*=r,t[10]*=o,t[3]*=i,t[7]*=r,t[11]*=o,this}getMaxScaleOnAxis(){let e=this.elements,t=e[0]*e[0]+e[1]*e[1]+e[2]*e[2],i=e[4]*e[4]+e[5]*e[5]+e[6]*e[6],r=e[8]*e[8]+e[9]*e[9]+e[10]*e[10];return Math.sqrt(Math.max(t,i,r))}makeTranslation(e,t,i){return e.isVector3?this.set(1,0,0,e.x,0,1,0,e.y,0,0,1,e.z,0,0,0,1):this.set(1,0,0,e,0,1,0,t,0,0,1,i,0,0,0,1),this}makeRotationX(e){let t=Math.cos(e),i=Math.sin(e);return this.set(1,0,0,0,0,t,-i,0,0,i,t,0,0,0,0,1),this}makeRotationY(e){let t=Math.cos(e),i=Math.sin(e);return this.set(t,0,i,0,0,1,0,0,-i,0,t,0,0,0,0,1),this}makeRotationZ(e){let t=Math.cos(e),i=Math.sin(e);return this.set(t,-i,0,0,i,t,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(e,t){let i=Math.cos(t),r=Math.sin(t),o=1-i,s=e.x,a=e.y,c=e.z,l=o*s,f=o*a;return this.set(l*s+i,l*a-r*c,l*c+r*a,0,l*a+r*c,f*a+i,f*c-r*s,0,l*c-r*a,f*c+r*s,o*c*c+i,0,0,0,0,1),this}makeScale(e,t,i){return this.set(e,0,0,0,0,t,0,0,0,0,i,0,0,0,0,1),this}makeShear(e,t,i,r,o,s){return this.set(1,i,o,0,e,1,s,0,t,r,1,0,0,0,0,1),this}compose(e,t,i){let r=this.elements,o=t._x,s=t._y,a=t._z,c=t._w,l=o+o,f=s+s,h=a+a,u=o*l,d=o*f,_=o*h,v=s*f,m=s*h,p=a*h,E=c*l,C=c*f,S=c*h,b=i.x,T=i.y,P=i.z;return r[0]=(1-(v+p))*b,r[1]=(d+S)*b,r[2]=(_-C)*b,r[3]=0,r[4]=(d-S)*T,r[5]=(1-(u+p))*T,r[6]=(m+E)*T,r[7]=0,r[8]=(_+C)*P,r[9]=(m-E)*P,r[10]=(1-(u+v))*P,r[11]=0,r[12]=e.x,r[13]=e.y,r[14]=e.z,r[15]=1,this}decompose(e,t,i){let r=this.elements;e.x=r[12],e.y=r[13],e.z=r[14];let o=this.determinantAffine();if(o===0)return i.set(1,1,1),t.identity(),this;let s=co.set(r[0],r[1],r[2]).length(),a=co.set(r[4],r[5],r[6]).length(),c=co.set(r[8],r[9],r[10]).length();o<0&&(s=-s),sn.copy(this);let l=1/s,f=1/a,h=1/c;return sn.elements[0]*=l,sn.elements[1]*=l,sn.elements[2]*=l,sn.elements[4]*=f,sn.elements[5]*=f,sn.elements[6]*=f,sn.elements[8]*=h,sn.elements[9]*=h,sn.elements[10]*=h,t.setFromRotationMatrix(sn),i.x=s,i.y=a,i.z=c,this}makePerspective(e,t,i,r,o,s,a=Pi,c=!1){let l=this.elements,f=2*o/(t-e),h=2*o/(i-r),u=(t+e)/(t-e),d=(i+r)/(i-r),_,v;if(c)_=o/(s-o),v=s*o/(s-o);else if(a===Pi)_=-(s+o)/(s-o),v=-2*s*o/(s-o);else if(a===Ln)_=-s/(s-o),v=-s*o/(s-o);else throw new Error("THREE.Matrix4.makePerspective(): Invalid coordinate system: "+a);return l[0]=f,l[4]=0,l[8]=u,l[12]=0,l[1]=0,l[5]=h,l[9]=d,l[13]=0,l[2]=0,l[6]=0,l[10]=_,l[14]=v,l[3]=0,l[7]=0,l[11]=-1,l[15]=0,this}makeOrthographic(e,t,i,r,o,s,a=Pi,c=!1){let l=this.elements,f=2/(t-e),h=2/(i-r),u=-(t+e)/(t-e),d=-(i+r)/(i-r),_,v;if(c)_=1/(s-o),v=s/(s-o);else if(a===Pi)_=-2/(s-o),v=-(s+o)/(s-o);else if(a===Ln)_=-1/(s-o),v=-o/(s-o);else throw new Error("THREE.Matrix4.makeOrthographic(): Invalid coordinate system: "+a);return l[0]=f,l[4]=0,l[8]=0,l[12]=u,l[1]=0,l[5]=h,l[9]=0,l[13]=d,l[2]=0,l[6]=0,l[10]=_,l[14]=v,l[3]=0,l[7]=0,l[11]=0,l[15]=1,this}equals(e){let t=this.elements,i=e.elements;for(let r=0;r<16;r++)if(t[r]!==i[r])return!1;return!0}fromArray(e,t=0){for(let i=0;i<16;i++)this.elements[i]=e[i+t];return this}toArray(e=[],t=0){let i=this.elements;return e[t]=i[0],e[t+1]=i[1],e[t+2]=i[2],e[t+3]=i[3],e[t+4]=i[4],e[t+5]=i[5],e[t+6]=i[6],e[t+7]=i[7],e[t+8]=i[8],e[t+9]=i[9],e[t+10]=i[10],e[t+11]=i[11],e[t+12]=i[12],e[t+13]=i[13],e[t+14]=i[14],e[t+15]=i[15],e}};Pa.prototype.isMatrix4=!0;var Ze=Pa,co=new L,sn=new Ze,Fm=new L(0,0,0),Um=new L(1,1,1),jn=new L,Ca=new L,Vi=new L;var Ff=new Ze,Uf=new Zi,Ui=class n{constructor(e=0,t=0,i=0,r=n.DEFAULT_ORDER){this.isEuler=!0,this._x=e,this._y=t,this._z=i,this._order=r}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get order(){return this._order}set order(e){this._order=e,this._onChangeCallback()}set(e,t,i,r=this._order){return this._x=e,this._y=t,this._z=i,this._order=r,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(e){return this._x=e._x,this._y=e._y,this._z=e._z,this._order=e._order,this._onChangeCallback(),this}setFromRotationMatrix(e,t=this._order,i=!0){let r=e.elements,o=r[0],s=r[4],a=r[8],c=r[1],l=r[5],f=r[9],h=r[2],u=r[6],d=r[10];switch(t){case"XYZ":this._y=Math.asin(qe(a,-1,1)),Math.abs(a)<.9999999?(this._x=Math.atan2(-f,d),this._z=Math.atan2(-s,o)):(this._x=Math.atan2(u,l),this._z=0);break;case"YXZ":this._x=Math.asin(-qe(f,-1,1)),Math.abs(f)<.9999999?(this._y=Math.atan2(a,d),this._z=Math.atan2(c,l)):(this._y=Math.atan2(-h,o),this._z=0);break;case"ZXY":this._x=Math.asin(qe(u,-1,1)),Math.abs(u)<.9999999?(this._y=Math.atan2(-h,d),this._z=Math.atan2(-s,l)):(this._y=0,this._z=Math.atan2(c,o));break;case"ZYX":this._y=Math.asin(-qe(h,-1,1)),Math.abs(h)<.9999999?(this._x=Math.atan2(u,d),this._z=Math.atan2(c,o)):(this._x=0,this._z=Math.atan2(-s,l));break;case"YZX":this._z=Math.asin(qe(c,-1,1)),Math.abs(c)<.9999999?(this._x=Math.atan2(-f,l),this._y=Math.atan2(-h,o)):(this._x=0,this._y=Math.atan2(a,d));break;case"XZY":this._z=Math.asin(-qe(s,-1,1)),Math.abs(s)<.9999999?(this._x=Math.atan2(u,l),this._y=Math.atan2(a,o)):(this._x=Math.atan2(-f,d),this._y=0);break;default:Re("Euler: .setFromRotationMatrix() encountered an unknown order: "+t)}return this._order=t,i===!0&&this._onChangeCallback(),this}setFromQuaternion(e,t,i){return Ff.makeRotationFromQuaternion(e),this.setFromRotationMatrix(Ff,t,i)}setFromVector3(e,t=this._order){return this.set(e.x,e.y,e.z,t)}reorder(e){return Uf.setFromEuler(this),this.setFromQuaternion(Uf,e)}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._order===this._order}fromArray(e){return this._x=e[0],this._y=e[1],this._z=e[2],e[3]!==void 0&&(this._order=e[3]),this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._order,e}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}};Ui.DEFAULT_ORDER="XYZ";var fo=class{constructor(){this.mask=1}set(e){this.mask=(1<<e|0)>>>0}enable(e){this.mask|=1<<e|0}enableAll(){this.mask=-1}toggle(e){this.mask^=1<<e|0}disable(e){this.mask&=~(1<<e|0)}disableAll(){this.mask=0}test(e){return(this.mask&e.mask)!==0}isEnabled(e){return(this.mask&(1<<e|0))!==0}};var Nm=0,Nf=new L,uo=new Zi,Dn=new Ze,La=new L,Ds=new L,Om=new L,Bm=new Zi,Of=new L(1,0,0),Bf=new L(0,1,0),Gf=new L(0,0,1),zf={type:"added"},Gm={type:"removed"},ho={type:"childadded",child:null},kl={type:"childremoved",child:null},dt=class n extends mi{constructor(){super(),this.isObject3D=!0,Object.defineProperty(this,"id",{value:Nm++}),this.uuid=Mn(),this.name="",this.type="Object3D",this.parent=null,this.children=[],this.up=n.DEFAULT_UP.clone();let e=new L,t=new Ui,i=new Zi,r=new L(1,1,1);function o(){i.setFromEuler(t,!1)}function s(){t.setFromQuaternion(i,void 0,!1)}t._onChange(o),i._onChange(s),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:e},rotation:{configurable:!0,enumerable:!0,value:t},quaternion:{configurable:!0,enumerable:!0,value:i},scale:{configurable:!0,enumerable:!0,value:r},modelViewMatrix:{value:new Ze},normalMatrix:{value:new Be}}),this.matrix=new Ze,this.matrixWorld=new Ze,this.matrixAutoUpdate=n.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=n.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new fo,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.customDepthMaterial=void 0,this.customDistanceMaterial=void 0,this.static=!1,this.userData={},this.pivot=null}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(e){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(e),this.matrix.decompose(this.position,this.quaternion,this.scale)}applyQuaternion(e){return this.quaternion.premultiply(e),this}setRotationFromAxisAngle(e,t){this.quaternion.setFromAxisAngle(e,t)}setRotationFromEuler(e){this.quaternion.setFromEuler(e,!0)}setRotationFromMatrix(e){this.quaternion.setFromRotationMatrix(e)}setRotationFromQuaternion(e){this.quaternion.copy(e)}rotateOnAxis(e,t){return uo.setFromAxisAngle(e,t),this.quaternion.multiply(uo),this}rotateOnWorldAxis(e,t){return uo.setFromAxisAngle(e,t),this.quaternion.premultiply(uo),this}rotateX(e){return this.rotateOnAxis(Of,e)}rotateY(e){return this.rotateOnAxis(Bf,e)}rotateZ(e){return this.rotateOnAxis(Gf,e)}translateOnAxis(e,t){return Nf.copy(e).applyQuaternion(this.quaternion),this.position.add(Nf.multiplyScalar(t)),this}translateX(e){return this.translateOnAxis(Of,e)}translateY(e){return this.translateOnAxis(Bf,e)}translateZ(e){return this.translateOnAxis(Gf,e)}localToWorld(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(this.matrixWorld)}worldToLocal(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(Dn.copy(this.matrixWorld).invert())}lookAt(e,t,i){e.isVector3?La.copy(e):La.set(e,t,i);let r=this.parent;this.updateWorldMatrix(!0,!1),Ds.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?Dn.lookAt(Ds,La,this.up):Dn.lookAt(La,Ds,this.up),this.quaternion.setFromRotationMatrix(Dn),r&&(Dn.extractRotation(r.matrixWorld),uo.setFromRotationMatrix(Dn),this.quaternion.premultiply(uo.invert()))}add(e){if(arguments.length>1){for(let t=0;t<arguments.length;t++)this.add(arguments[t]);return this}return e===this?(Qe("Object3D.add: object can't be added as a child of itself.",e),this):(e&&e.isObject3D?(e.removeFromParent(),e.parent=this,this.children.push(e),e.dispatchEvent(zf),ho.child=e,this.dispatchEvent(ho),ho.child=null):Qe("Object3D.add: object not an instance of THREE.Object3D.",e),this)}remove(e){if(arguments.length>1){for(let i=0;i<arguments.length;i++)this.remove(arguments[i]);return this}let t=this.children.indexOf(e);return t!==-1&&(e.parent=null,this.children.splice(t,1),e.dispatchEvent(Gm),kl.child=e,this.dispatchEvent(kl),kl.child=null),this}removeFromParent(){let e=this.parent;return e!==null&&e.remove(this),this}clear(){return this.remove(...this.children)}attach(e){return this.updateWorldMatrix(!0,!1),Dn.copy(this.matrixWorld).invert(),e.parent!==null&&(e.parent.updateWorldMatrix(!0,!1),Dn.multiply(e.parent.matrixWorld)),e.applyMatrix4(Dn),e.removeFromParent(),e.parent=this,this.children.push(e),e.updateWorldMatrix(!1,!0),e.dispatchEvent(zf),ho.child=e,this.dispatchEvent(ho),ho.child=null,this}getObjectById(e){return this.getObjectByProperty("id",e)}getObjectByName(e){return this.getObjectByProperty("name",e)}getObjectByProperty(e,t){if(this[e]===t)return this;for(let i=0,r=this.children.length;i<r;i++){let s=this.children[i].getObjectByProperty(e,t);if(s!==void 0)return s}}getObjectsByProperty(e,t,i=[]){this[e]===t&&i.push(this);let r=this.children;for(let o=0,s=r.length;o<s;o++)r[o].getObjectsByProperty(e,t,i);return i}getWorldPosition(e){return this.updateWorldMatrix(!0,!1),e.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(Ds,e,Om),e}getWorldScale(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(Ds,Bm,e),e}getWorldDirection(e){this.updateWorldMatrix(!0,!1);let t=this.matrixWorld.elements;return e.set(t[8],t[9],t[10]).normalize()}raycast(){}intersectsFrustum(){}traverse(e){e(this);let t=this.children;for(let i=0,r=t.length;i<r;i++)t[i].traverse(e)}traverseVisible(e){if(this.visible===!1)return;e(this);let t=this.children;for(let i=0,r=t.length;i<r;i++)t[i].traverseVisible(e)}traverseAncestors(e){let t=this.parent;t!==null&&(e(t),t.traverseAncestors(e))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale);let e=this.pivot;if(e!==null){let t=e.x,i=e.y,r=e.z,o=this.matrix.elements;o[12]+=t-o[0]*t-o[4]*i-o[8]*r,o[13]+=i-o[1]*t-o[5]*i-o[9]*r,o[14]+=r-o[2]*t-o[6]*i-o[10]*r}this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(e){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||e)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,e=!0);let t=this.children;for(let i=0,r=t.length;i<r;i++)t[i].updateMatrixWorld(e)}updateWorldMatrix(e,t,i=!1){let r=this.parent;if(e===!0&&r!==null&&r.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||i)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,i=!0),t===!0){let o=this.children;for(let s=0,a=o.length;s<a;s++)o[s].updateWorldMatrix(!1,!0,i)}}toJSON(e){let t=e===void 0||typeof e=="string",i={};t&&(e={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},i.metadata={version:4.7,type:"Object",generator:"Object3D.toJSON"});let r={};r.uuid=this.uuid,r.type=this.type,r.name=this.name,r.castShadow=this.castShadow,r.receiveShadow=this.receiveShadow,r.visible=this.visible,r.frustumCulled=this.frustumCulled,r.renderOrder=this.renderOrder,r.static=this.static,r.matrixAutoUpdate=this.matrixAutoUpdate,Object.keys(this.userData).length>0&&(r.userData=this.userData),r.layers=this.layers.mask,r.matrix=this.matrix.toArray(),r.up=this.up.toArray(),this.pivot!==null&&(r.pivot=this.pivot.toArray()),this.morphTargetDictionary!==void 0&&(r.morphTargetDictionary=Object.assign({},this.morphTargetDictionary)),this.morphTargetInfluences!==void 0&&(r.morphTargetInfluences=this.morphTargetInfluences.slice()),this.isInstancedMesh&&(r.type="InstancedMesh",r.count=this.count,r.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(r.instanceColor=this.instanceColor.toJSON())),this.isBatchedMesh&&(r.type="BatchedMesh",r.perObjectFrustumCulled=this.perObjectFrustumCulled,r.sortObjects=this.sortObjects,r.drawRanges=this._drawRanges,r.reservedRanges=this._reservedRanges,r.geometryInfo=this._geometryInfo.map(a=>({...a,boundingBox:a.boundingBox?a.boundingBox.toJSON():void 0,boundingSphere:a.boundingSphere?a.boundingSphere.toJSON():void 0})),r.instanceInfo=this._instanceInfo.map(a=>({...a})),r.availableInstanceIds=this._availableInstanceIds.slice(),r.availableGeometryIds=this._availableGeometryIds.slice(),r.nextIndexStart=this._nextIndexStart,r.nextVertexStart=this._nextVertexStart,r.geometryCount=this._geometryCount,r.maxInstanceCount=this._maxInstanceCount,r.maxVertexCount=this._maxVertexCount,r.maxIndexCount=this._maxIndexCount,r.geometryInitialized=this._geometryInitialized,r.matricesTexture=this._matricesTexture.toJSON(e),r.indirectTexture=this._indirectTexture.toJSON(e),this._colorsTexture!==null&&(r.colorsTexture=this._colorsTexture.toJSON(e)),this.boundingSphere!==null&&(r.boundingSphere=this.boundingSphere.toJSON()),this.boundingBox!==null&&(r.boundingBox=this.boundingBox.toJSON()));function o(a,c){return a[c.uuid]===void 0&&(a[c.uuid]=c.toJSON(e)),c.uuid}if(this.isScene)this.background&&(this.background.isColor?r.background=this.background.toJSON():this.background.isTexture&&(r.background=this.background.toJSON(e).uuid)),this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0&&(r.environment=this.environment.toJSON(e).uuid);else if(this.isMesh||this.isLine||this.isPoints){r.geometry=o(e.geometries,this.geometry);let a=this.geometry.parameters;if(a!==void 0&&a.shapes!==void 0){let c=a.shapes;if(Array.isArray(c))for(let l=0,f=c.length;l<f;l++){let h=c[l];o(e.shapes,h)}else o(e.shapes,c)}}if(this.isSkinnedMesh&&(r.bindMode=this.bindMode,r.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(o(e.skeletons,this.skeleton),r.skeleton=this.skeleton.uuid)),this.material!==void 0)if(Array.isArray(this.material)){let a=[];for(let c=0,l=this.material.length;c<l;c++)a.push(o(e.materials,this.material[c]));r.material=a}else r.material=o(e.materials,this.material);if(this.children.length>0){r.children=[];for(let a=0;a<this.children.length;a++)r.children.push(this.children[a].toJSON(e).object)}if(this.animations.length>0){r.animations=[];for(let a=0;a<this.animations.length;a++){let c=this.animations[a];r.animations.push(o(e.animations,c))}}if(t){let a=s(e.geometries),c=s(e.materials),l=s(e.textures),f=s(e.images),h=s(e.shapes),u=s(e.skeletons),d=s(e.animations),_=s(e.nodes);a.length>0&&(i.geometries=a),c.length>0&&(i.materials=c),l.length>0&&(i.textures=l),f.length>0&&(i.images=f),h.length>0&&(i.shapes=h),u.length>0&&(i.skeletons=u),d.length>0&&(i.animations=d),_.length>0&&(i.nodes=_)}return i.object=r,i;function s(a){let c=[];for(let l in a){let f=a[l];delete f.metadata,c.push(f)}return c}}clone(e){return new this.constructor().copy(this,e)}copy(e,t=!0){if(this.name=e.name,this.up.copy(e.up),this.position.copy(e.position),this.rotation.order=e.rotation.order,this.quaternion.copy(e.quaternion),this.scale.copy(e.scale),this.pivot=e.pivot!==null?e.pivot.clone():null,this.matrix.copy(e.matrix),this.matrixWorld.copy(e.matrixWorld),this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrixWorldAutoUpdate=e.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=e.matrixWorldNeedsUpdate,this.layers.mask=e.layers.mask,this.visible=e.visible,this.castShadow=e.castShadow,this.receiveShadow=e.receiveShadow,this.frustumCulled=e.frustumCulled,this.renderOrder=e.renderOrder,this.static=e.static,this.animations=e.animations.slice(),this.userData=JSON.parse(JSON.stringify(e.userData)),t===!0)for(let i=0;i<e.children.length;i++){let r=e.children[i];this.add(r.clone())}return this}dispose(){this.dispatchEvent({type:"dispose"})}};dt.DEFAULT_UP=new L(0,1,0);dt.DEFAULT_MATRIX_AUTO_UPDATE=!0;dt.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;var Ki=class extends dt{constructor(){super(),this.isGroup=!0,this.type="Group"}};var Vf={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},er={h:0,s:0,l:0},Da={h:0,s:0,l:0};function Wl(n,e,t){return t<0&&(t+=1),t>1&&(t-=1),t<1/6?n+(e-n)*6*t:t<1/2?e:t<2/3?n+(e-n)*6*(2/3-t):n}var Ee=class{constructor(e,t,i){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(e,t,i)}set(e,t,i){if(t===void 0&&i===void 0){let r=e;r&&r.isColor?this.copy(r):typeof r=="number"?this.setHex(r):typeof r=="string"&&this.setStyle(r)}else this.setRGB(e,t,i);return this}setScalar(e){return this.r=e,this.g=e,this.b=e,this}setHex(e,t=ei){return e=Math.floor(e),this.r=(e>>16&255)/255,this.g=(e>>8&255)/255,this.b=(e&255)/255,Ye.colorSpaceToWorking(this,t),this}setRGB(e,t,i,r=Ye.workingColorSpace){return this.r=e,this.g=t,this.b=i,Ye.colorSpaceToWorking(this,r),this}setHSL(e,t,i,r=Ye.workingColorSpace){if(e=Pf(e,1),t=qe(t,0,1),i=qe(i,0,1),t===0)this.r=this.g=this.b=i;else{let o=i<=.5?i*(1+t):i+t-i*t,s=2*i-o;this.r=Wl(s,o,e+1/3),this.g=Wl(s,o,e),this.b=Wl(s,o,e-1/3)}return Ye.colorSpaceToWorking(this,r),this}setStyle(e,t=ei){function i(o){o!==void 0&&parseFloat(o)<1&&Re("Color: Alpha component of "+e+" will be ignored.")}let r;if(r=/^(\w+)\(([^\)]*)\)/.exec(e)){let o,s=r[1],a=r[2];switch(s){case"rgb":case"rgba":if(o=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(a))return i(o[4]),this.setRGB(Math.min(255,parseInt(o[1],10))/255,Math.min(255,parseInt(o[2],10))/255,Math.min(255,parseInt(o[3],10))/255,t);if(o=/^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(a))return i(o[4]),this.setRGB(Math.min(100,parseInt(o[1],10))/100,Math.min(100,parseInt(o[2],10))/100,Math.min(100,parseInt(o[3],10))/100,t);break;case"hsl":case"hsla":if(o=/^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(a))return i(o[4]),this.setHSL(parseFloat(o[1])/360,parseFloat(o[2])/100,parseFloat(o[3])/100,t);break;default:Re("Color: Unknown color model "+e)}}else if(r=/^\#([A-Fa-f\d]+)$/.exec(e)){let o=r[1],s=o.length;if(s===3)return this.setRGB(parseInt(o.charAt(0),16)/15,parseInt(o.charAt(1),16)/15,parseInt(o.charAt(2),16)/15,t);if(s===6)return this.setHex(parseInt(o,16),t);Re("Color: Invalid hex color "+e)}else if(e&&e.length>0)return this.setColorName(e,t);return this}setColorName(e,t=ei){let i=Vf[e.toLowerCase()];return i!==void 0?this.setHex(i,t):Re("Color: Unknown color "+e),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(e){return this.r=e.r,this.g=e.g,this.b=e.b,this}copySRGBToLinear(e){return this.r=on(e.r),this.g=on(e.g),this.b=on(e.b),this}copyLinearToSRGB(e){return this.r=Tr(e.r),this.g=Tr(e.g),this.b=Tr(e.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(e=ei){return Ye.workingToColorSpace(xi.copy(this),e),Math.round(qe(xi.r*255,0,255))*65536+Math.round(qe(xi.g*255,0,255))*256+Math.round(qe(xi.b*255,0,255))}getHexString(e=ei){return("000000"+this.getHex(e).toString(16)).slice(-6)}getHSL(e,t=Ye.workingColorSpace){Ye.workingToColorSpace(xi.copy(this),t);let i=xi.r,r=xi.g,o=xi.b,s=Math.max(i,r,o),a=Math.min(i,r,o),c,l,f=(a+s)/2;if(a===s)c=0,l=0;else{let h=s-a;switch(l=f<=.5?h/(s+a):h/(2-s-a),s){case i:c=(r-o)/h+(r<o?6:0);break;case r:c=(o-i)/h+2;break;case o:c=(i-r)/h+4;break}c/=6}return e.h=c,e.s=l,e.l=f,e}getRGB(e,t=Ye.workingColorSpace){return Ye.workingToColorSpace(xi.copy(this),t),e.r=xi.r,e.g=xi.g,e.b=xi.b,e}getStyle(e=ei){Ye.workingToColorSpace(xi.copy(this),e);let t=xi.r,i=xi.g,r=xi.b;return e!==ei?`color(${e} ${t.toFixed(3)} ${i.toFixed(3)} ${r.toFixed(3)})`:`rgb(${Math.round(t*255)},${Math.round(i*255)},${Math.round(r*255)})`}offsetHSL(e,t,i){return this.getHSL(er),this.setHSL(er.h+e,er.s+t,er.l+i)}add(e){return this.r+=e.r,this.g+=e.g,this.b+=e.b,this}addColors(e,t){return this.r=e.r+t.r,this.g=e.g+t.g,this.b=e.b+t.b,this}addScalar(e){return this.r+=e,this.g+=e,this.b+=e,this}sub(e){return this.r=Math.max(0,this.r-e.r),this.g=Math.max(0,this.g-e.g),this.b=Math.max(0,this.b-e.b),this}multiply(e){return this.r*=e.r,this.g*=e.g,this.b*=e.b,this}multiplyScalar(e){return this.r*=e,this.g*=e,this.b*=e,this}lerp(e,t){return this.r+=(e.r-this.r)*t,this.g+=(e.g-this.g)*t,this.b+=(e.b-this.b)*t,this}lerpColors(e,t,i){return this.r=e.r+(t.r-e.r)*i,this.g=e.g+(t.g-e.g)*i,this.b=e.b+(t.b-e.b)*i,this}lerpHSL(e,t){this.getHSL(er),e.getHSL(Da);let i=Ta(er.h,Da.h,t),r=Ta(er.s,Da.s,t),o=Ta(er.l,Da.l,t);return this.setHSL(i,r,o),this}setFromVector3(e){return this.r=e.x,this.g=e.y,this.b=e.z,this}applyMatrix3(e){let t=this.r,i=this.g,r=this.b,o=e.elements;return this.r=o[0]*t+o[3]*i+o[6]*r,this.g=o[1]*t+o[4]*i+o[7]*r,this.b=o[2]*t+o[5]*i+o[8]*r,this}equals(e){return e.r===this.r&&e.g===this.g&&e.b===this.b}fromArray(e,t=0){return this.r=e[t],this.g=e[t+1],this.b=e[t+2],this}toArray(e=[],t=0){return e[t]=this.r,e[t+1]=this.g,e[t+2]=this.b,e}fromBufferAttribute(e,t){return this.r=e.getX(t),this.g=e.getY(t),this.b=e.getZ(t),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}},xi=new Ee;Ee.NAMES=Vf;var Ar=class extends dt{constructor(){super(),this.isScene=!0,this.type="Scene",this.background=null,this.environment=null,this.fog=null,this.backgroundBlurriness=0,this.backgroundIntensity=1,this.backgroundRotation=new Ui,this.environmentIntensity=1,this.environmentRotation=new Ui,this.overrideMaterial=null,typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}copy(e,t){return super.copy(e,t),e.background!==null&&(this.background=e.background.clone()),e.environment!==null&&(this.environment=e.environment.clone()),e.fog!==null&&(this.fog=e.fog.clone()),this.backgroundBlurriness=e.backgroundBlurriness,this.backgroundIntensity=e.backgroundIntensity,this.backgroundRotation.copy(e.backgroundRotation),this.environmentIntensity=e.environmentIntensity,this.environmentRotation.copy(e.environmentRotation),e.overrideMaterial!==null&&(this.overrideMaterial=e.overrideMaterial.clone()),this.matrixAutoUpdate=e.matrixAutoUpdate,this}toJSON(e){let t=super.toJSON(e);return this.fog!==null&&(t.object.fog=this.fog.toJSON()),t.object.backgroundBlurriness=this.backgroundBlurriness,t.object.backgroundIntensity=this.backgroundIntensity,t.object.backgroundRotation=this.backgroundRotation.toArray(),t.object.environmentIntensity=this.environmentIntensity,t.object.environmentRotation=this.environmentRotation.toArray(),t}};var an=new L,In=new L,Xl=new L,Fn=new L,po=new L,mo=new L,Hf=new L,ql=new L,Yl=new L,Zl=new L,Kl=new At,Jl=new At,$l=new At,tr=class n{constructor(e=new L,t=new L,i=new L){this.a=e,this.b=t,this.c=i}static getNormal(e,t,i,r){r.subVectors(i,t),an.subVectors(e,t),r.cross(an);let o=r.lengthSq();return o>0?r.multiplyScalar(1/Math.sqrt(o)):r.set(0,0,0)}static getBarycoord(e,t,i,r,o){an.subVectors(r,t),In.subVectors(i,t),Xl.subVectors(e,t);let s=an.dot(an),a=an.dot(In),c=an.dot(Xl),l=In.dot(In),f=In.dot(Xl),h=s*l-a*a;if(h===0)return o.set(0,0,0),null;let u=1/h,d=(l*c-a*f)*u,_=(s*f-a*c)*u;return o.set(1-d-_,_,d)}static containsPoint(e,t,i,r){return this.getBarycoord(e,t,i,r,Fn)===null?!1:Fn.x>=0&&Fn.y>=0&&Fn.x+Fn.y<=1}static getInterpolation(e,t,i,r,o,s,a,c){return this.getBarycoord(e,t,i,r,Fn)===null?(c.x=0,c.y=0,"z"in c&&(c.z=0),"w"in c&&(c.w=0),null):(c.setScalar(0),c.addScaledVector(o,Fn.x),c.addScaledVector(s,Fn.y),c.addScaledVector(a,Fn.z),c)}static getInterpolatedAttribute(e,t,i,r,o,s){return Kl.setScalar(0),Jl.setScalar(0),$l.setScalar(0),Kl.fromBufferAttribute(e,t),Jl.fromBufferAttribute(e,i),$l.fromBufferAttribute(e,r),s.setScalar(0),s.addScaledVector(Kl,o.x),s.addScaledVector(Jl,o.y),s.addScaledVector($l,o.z),s}static isFrontFacing(e,t,i,r){return an.subVectors(i,t),In.subVectors(e,t),an.cross(In).dot(r)<0}set(e,t,i){return this.a.copy(e),this.b.copy(t),this.c.copy(i),this}setFromPointsAndIndices(e,t,i,r){return this.a.copy(e[t]),this.b.copy(e[i]),this.c.copy(e[r]),this}setFromAttributeAndIndices(e,t,i,r){return this.a.fromBufferAttribute(e,t),this.b.fromBufferAttribute(e,i),this.c.fromBufferAttribute(e,r),this}clone(){return new this.constructor().copy(this)}copy(e){return this.a.copy(e.a),this.b.copy(e.b),this.c.copy(e.c),this}getArea(){return an.subVectors(this.c,this.b),In.subVectors(this.a,this.b),an.cross(In).length()*.5}getMidpoint(e){return e.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(e){return n.getNormal(this.a,this.b,this.c,e)}getPlane(e){return e.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(e,t){return n.getBarycoord(e,this.a,this.b,this.c,t)}getInterpolation(e,t,i,r,o){return n.getInterpolation(e,this.a,this.b,this.c,t,i,r,o)}containsPoint(e){return n.containsPoint(e,this.a,this.b,this.c)}isFrontFacing(e){return n.isFrontFacing(this.a,this.b,this.c,e)}intersectsBox(e){return e.intersectsTriangle(this)}closestPointToPoint(e,t){let i=this.a,r=this.b,o=this.c,s,a;po.subVectors(r,i),mo.subVectors(o,i),ql.subVectors(e,i);let c=po.dot(ql),l=mo.dot(ql);if(c<=0&&l<=0)return t.copy(i);Yl.subVectors(e,r);let f=po.dot(Yl),h=mo.dot(Yl);if(f>=0&&h<=f)return t.copy(r);let u=c*h-f*l;if(u<=0&&c>=0&&f<=0)return s=c/(c-f),t.copy(i).addScaledVector(po,s);Zl.subVectors(e,o);let d=po.dot(Zl),_=mo.dot(Zl);if(_>=0&&d<=_)return t.copy(o);let v=d*l-c*_;if(v<=0&&l>=0&&_<=0)return a=l/(l-_),t.copy(i).addScaledVector(mo,a);let m=f*_-d*h;if(m<=0&&h-f>=0&&d-_>=0)return Hf.subVectors(o,r),a=(h-f)/(h-f+(d-_)),t.copy(r).addScaledVector(Hf,a);let p=1/(m+v+u);return s=v*p,a=u*p,t.copy(i).addScaledVector(po,s).addScaledVector(mo,a)}equals(e){return e.a.equals(this.a)&&e.b.equals(this.b)&&e.c.equals(this.c)}};var Ji=class{constructor(e=new L(1/0,1/0,1/0),t=new L(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=e,this.max=t}set(e,t){return this.min.copy(e),this.max.copy(t),this}setFromArray(e){this.makeEmpty();for(let t=0,i=e.length;t<i;t+=3)this.expandByPoint(ln.fromArray(e,t));return this}setFromBufferAttribute(e){this.makeEmpty();for(let t=0,i=e.count;t<i;t++)this.expandByPoint(ln.fromBufferAttribute(e,t));return this}setFromPoints(e){this.makeEmpty();for(let t=0,i=e.length;t<i;t++)this.expandByPoint(e[t]);return this}setFromCenterAndSize(e,t){let i=ln.copy(t).multiplyScalar(.5);return this.min.copy(e).sub(i),this.max.copy(e).add(i),this}setFromObject(e,t=!1){return this.makeEmpty(),this.expandByObject(e,t)}clone(){return new this.constructor().copy(this)}copy(e){return this.min.copy(e.min),this.max.copy(e.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(e){return this.isEmpty()?e.set(0,0,0):e.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(e){return this.isEmpty()?e.set(0,0,0):e.subVectors(this.max,this.min)}expandByPoint(e){return this.min.min(e),this.max.max(e),this}expandByVector(e){return this.min.sub(e),this.max.add(e),this}expandByScalar(e){return this.min.addScalar(-e),this.max.addScalar(e),this}expandByObject(e,t=!1){e.updateWorldMatrix(!1,!1);let i=e.geometry;if(i!==void 0){let o=i.getAttribute("position");if(t===!0&&o!==void 0&&e.isInstancedMesh!==!0)for(let s=0,a=o.count;s<a;s++)e.isMesh===!0?e.getVertexPosition(s,ln):ln.fromBufferAttribute(o,s),ln.applyMatrix4(e.matrixWorld),this.expandByPoint(ln);else e.boundingBox!==void 0?(e.boundingBox===null&&e.computeBoundingBox(),Ia.copy(e.boundingBox)):(i.boundingBox===null&&i.computeBoundingBox(),Ia.copy(i.boundingBox)),Ia.applyMatrix4(e.matrixWorld),this.union(Ia)}let r=e.children;for(let o=0,s=r.length;o<s;o++)this.expandByObject(r[o],t);return this}containsPoint(e){return e.x>=this.min.x&&e.x<=this.max.x&&e.y>=this.min.y&&e.y<=this.max.y&&e.z>=this.min.z&&e.z<=this.max.z}containsBox(e){return this.min.x<=e.min.x&&e.max.x<=this.max.x&&this.min.y<=e.min.y&&e.max.y<=this.max.y&&this.min.z<=e.min.z&&e.max.z<=this.max.z}getParameter(e,t){return t.set((e.x-this.min.x)/(this.max.x-this.min.x),(e.y-this.min.y)/(this.max.y-this.min.y),(e.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(e){return e.max.x>=this.min.x&&e.min.x<=this.max.x&&e.max.y>=this.min.y&&e.min.y<=this.max.y&&e.max.z>=this.min.z&&e.min.z<=this.max.z}intersectsSphere(e){return this.clampPoint(e.center,ln),ln.distanceToSquared(e.center)<=e.radius*e.radius}intersectsPlane(e){let t,i;return e.normal.x>0?(t=e.normal.x*this.min.x,i=e.normal.x*this.max.x):(t=e.normal.x*this.max.x,i=e.normal.x*this.min.x),e.normal.y>0?(t+=e.normal.y*this.min.y,i+=e.normal.y*this.max.y):(t+=e.normal.y*this.max.y,i+=e.normal.y*this.min.y),e.normal.z>0?(t+=e.normal.z*this.min.z,i+=e.normal.z*this.max.z):(t+=e.normal.z*this.max.z,i+=e.normal.z*this.min.z),t<=-e.constant&&i>=-e.constant}intersectsTriangle(e){if(this.isEmpty())return!1;this.getCenter(Is),Fa.subVectors(this.max,Is),go.subVectors(e.a,Is),_o.subVectors(e.b,Is),xo.subVectors(e.c,Is),ir.subVectors(_o,go),nr.subVectors(xo,_o),wr.subVectors(go,xo);let t=[0,-ir.z,ir.y,0,-nr.z,nr.y,0,-wr.z,wr.y,ir.z,0,-ir.x,nr.z,0,-nr.x,wr.z,0,-wr.x,-ir.y,ir.x,0,-nr.y,nr.x,0,-wr.y,wr.x,0];return!Ql(t,go,_o,xo,Fa)||(t=[1,0,0,0,1,0,0,0,1],!Ql(t,go,_o,xo,Fa))?!1:(Ua.crossVectors(ir,nr),t=[Ua.x,Ua.y,Ua.z],Ql(t,go,_o,xo,Fa))}clampPoint(e,t){return t.copy(e).clamp(this.min,this.max)}distanceToPoint(e){return this.clampPoint(e,ln).distanceTo(e)}getBoundingSphere(e){return this.isEmpty()?e.makeEmpty():(this.getCenter(e.center),e.radius=this.getSize(ln).length()*.5),e}intersect(e){return this.min.max(e.min),this.max.min(e.max),this.isEmpty()&&this.makeEmpty(),this}union(e){return this.min.min(e.min),this.max.max(e.max),this}applyMatrix4(e){return this.isEmpty()?this:(Un[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(e),Un[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(e),Un[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(e),Un[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(e),Un[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(e),Un[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(e),Un[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(e),Un[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(e),this.setFromPoints(Un),this)}translate(e){return this.min.add(e),this.max.add(e),this}equals(e){return e.min.equals(this.min)&&e.max.equals(this.max)}toJSON(){return{min:this.min.toArray(),max:this.max.toArray()}}fromJSON(e){return this.min.fromArray(e.min),this.max.fromArray(e.max),this}},Un=[new L,new L,new L,new L,new L,new L,new L,new L],ln=new L,Ia=new Ji,go=new L,_o=new L,xo=new L,ir=new L,nr=new L,wr=new L,Is=new L,Fa=new L,Ua=new L,Rr=new L;function Ql(n,e,t,i,r){for(let o=0,s=n.length-3;o<=s;o+=3){Rr.fromArray(n,o);let a=r.x*Math.abs(Rr.x)+r.y*Math.abs(Rr.y)+r.z*Math.abs(Rr.z),c=e.dot(Rr),l=t.dot(Rr),f=i.dot(Rr);if(Math.max(-Math.max(c,l,f),Math.min(c,l,f))>a)return!1}return!0}var qt=new L,Na=new Ne,zm=0,Vt=class extends mi{constructor(e,t,i=!1){if(super(),Array.isArray(e))throw new TypeError("THREE.BufferAttribute: array should be a Typed Array.");this.isBufferAttribute=!0,Object.defineProperty(this,"id",{value:zm++}),this.name="",this.array=e,this.itemSize=t,this.count=e!==void 0?e.length/t:0,this.normalized=i,this.usage=Ef,this.updateRanges=[],this.gpuType=Kt,this.version=0}onUploadCallback(){}set needsUpdate(e){e===!0&&this.version++}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.name=e.name,this.array=new e.array.constructor(e.array),this.itemSize=e.itemSize,this.count=e.count,this.normalized=e.normalized,this.usage=e.usage,this.gpuType=e.gpuType,this}copyAt(e,t,i){e*=this.itemSize,i*=t.itemSize;for(let r=0,o=this.itemSize;r<o;r++)this.array[e+r]=t.array[i+r];return this}copyArray(e){return this.array.set(e),this}applyMatrix3(e){if(this.itemSize===2)for(let t=0,i=this.count;t<i;t++)Na.fromBufferAttribute(this,t),Na.applyMatrix3(e),this.setXY(t,Na.x,Na.y);else if(this.itemSize===3)for(let t=0,i=this.count;t<i;t++)qt.fromBufferAttribute(this,t),qt.applyMatrix3(e),this.setXYZ(t,qt.x,qt.y,qt.z);return this}applyMatrix4(e){for(let t=0,i=this.count;t<i;t++)qt.fromBufferAttribute(this,t),qt.applyMatrix4(e),this.setXYZ(t,qt.x,qt.y,qt.z);return this}applyNormalMatrix(e){for(let t=0,i=this.count;t<i;t++)qt.fromBufferAttribute(this,t),qt.applyNormalMatrix(e),this.setXYZ(t,qt.x,qt.y,qt.z);return this}transformDirection(e){for(let t=0,i=this.count;t<i;t++)qt.fromBufferAttribute(this,t),qt.transformDirection(e),this.setXYZ(t,qt.x,qt.y,qt.z);return this}set(e,t=0){return this.array.set(e,t),this}getComponent(e,t){let i=this.array[e*this.itemSize+t];return this.normalized&&(i=so(i,this.array)),i}setComponent(e,t,i){return this.normalized&&(i=Li(i,this.array)),this.array[e*this.itemSize+t]=i,this}getX(e){let t=this.array[e*this.itemSize];return this.normalized&&(t=so(t,this.array)),t}setX(e,t){return this.normalized&&(t=Li(t,this.array)),this.array[e*this.itemSize]=t,this}getY(e){let t=this.array[e*this.itemSize+1];return this.normalized&&(t=so(t,this.array)),t}setY(e,t){return this.normalized&&(t=Li(t,this.array)),this.array[e*this.itemSize+1]=t,this}getZ(e){let t=this.array[e*this.itemSize+2];return this.normalized&&(t=so(t,this.array)),t}setZ(e,t){return this.normalized&&(t=Li(t,this.array)),this.array[e*this.itemSize+2]=t,this}getW(e){let t=this.array[e*this.itemSize+3];return this.normalized&&(t=so(t,this.array)),t}setW(e,t){return this.normalized&&(t=Li(t,this.array)),this.array[e*this.itemSize+3]=t,this}setXY(e,t,i){return e*=this.itemSize,this.normalized&&(t=Li(t,this.array),i=Li(i,this.array)),this.array[e+0]=t,this.array[e+1]=i,this}setXYZ(e,t,i,r){return e*=this.itemSize,this.normalized&&(t=Li(t,this.array),i=Li(i,this.array),r=Li(r,this.array)),this.array[e+0]=t,this.array[e+1]=i,this.array[e+2]=r,this}setXYZW(e,t,i,r,o){return e*=this.itemSize,this.normalized&&(t=Li(t,this.array),i=Li(i,this.array),r=Li(r,this.array),o=Li(o,this.array)),this.array[e+0]=t,this.array[e+1]=i,this.array[e+2]=r,this.array[e+3]=o,this}onUpload(e){return this.onUploadCallback=e,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){let e={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return e.name=this.name,e.usage=this.usage,e.gpuType=this.gpuType,e}dispose(){this.dispatchEvent({type:"dispose"})}};var Mo=class extends Vt{constructor(e,t,i){super(new Uint16Array(e),t,i)}};var vo=class extends Vt{constructor(e,t,i){super(new Uint32Array(e),t,i)}};var gt=class extends Vt{constructor(e,t,i){super(new Float32Array(e),t,i)}};var Vm=new Ji,Fs=new L,jl=new L,Hi=class{constructor(e=new L,t=-1){this.isSphere=!0,this.center=e,this.radius=t}set(e,t){return this.center.copy(e),this.radius=t,this}setFromPoints(e,t){let i=this.center;t!==void 0?i.copy(t):Vm.setFromPoints(e).getCenter(i);let r=0;for(let o=0,s=e.length;o<s;o++)r=Math.max(r,i.distanceToSquared(e[o]));return this.radius=Math.sqrt(r),this}copy(e){return this.center.copy(e.center),this.radius=e.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(e){return e.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(e){return e.distanceTo(this.center)-this.radius}intersectsSphere(e){let t=this.radius+e.radius;return e.center.distanceToSquared(this.center)<=t*t}intersectsBox(e){return e.intersectsSphere(this)}intersectsPlane(e){return Math.abs(e.distanceToPoint(this.center))<=this.radius}clampPoint(e,t){let i=this.center.distanceToSquared(e);return t.copy(e),i>this.radius*this.radius&&(t.sub(this.center).normalize(),t.multiplyScalar(this.radius).add(this.center)),t}getBoundingBox(e){return this.isEmpty()?(e.makeEmpty(),e):(e.set(this.center,this.center),e.expandByScalar(this.radius),e)}applyMatrix4(e){return this.center.applyMatrix4(e),this.radius=this.radius*e.getMaxScaleOnAxis(),this}translate(e){return this.center.add(e),this}expandByPoint(e){if(this.isEmpty())return this.center.copy(e),this.radius=0,this;Fs.subVectors(e,this.center);let t=Fs.lengthSq();if(t>this.radius*this.radius){let i=Math.sqrt(t),r=(i-this.radius)*.5;this.center.addScaledVector(Fs,r/i),this.radius+=r}return this}union(e){return e.isEmpty()?this:this.isEmpty()?(this.copy(e),this):(this.center.equals(e.center)===!0?this.radius=Math.max(this.radius,e.radius):(jl.subVectors(e.center,this.center).setLength(e.radius),this.expandByPoint(Fs.copy(e.center).add(jl)),this.expandByPoint(Fs.copy(e.center).sub(jl))),this)}equals(e){return e.center.equals(this.center)&&e.radius===this.radius}clone(){return new this.constructor().copy(this)}toJSON(){return{radius:this.radius,center:this.center.toArray()}}fromJSON(e){return this.radius=e.radius,this.center.fromArray(e.center),this}};var Hm=0,$i=new Ze,ec=new dt,So=new L,ki=new Ji,Us=new Ji,ti=new L,Ct=class n extends mi{constructor(){super(),this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:Hm++}),this.uuid=Mn(),this.name="",this.type="BufferGeometry",this.index=null,this.indirect=null,this.indirectOffset=0,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={},this._transformed=!1}getIndex(){return this.index}setIndex(e){return Array.isArray(e)?this.index=new(Tf(e)?vo:Mo)(e,1):this.index=e,this}setIndirect(e,t=0){return this.indirect=e,this.indirectOffset=t,this}getIndirect(){return this.indirect}getAttribute(e){return this.attributes[e]}setAttribute(e,t){return this.attributes[e]=t,this}deleteAttribute(e){return delete this.attributes[e],this}hasAttribute(e){return this.attributes[e]!==void 0}addGroup(e,t,i=0){this.groups.push({start:e,count:t,materialIndex:i})}clearGroups(){this.groups=[]}setDrawRange(e,t){this.drawRange.start=e,this.drawRange.count=t}applyMatrix4(e){let t=this.attributes.position;t!==void 0&&(t.applyMatrix4(e),t.needsUpdate=!0);let i=this.attributes.normal;if(i!==void 0){let o=new Be().getNormalMatrix(e);i.applyNormalMatrix(o),i.needsUpdate=!0}let r=this.attributes.tangent;return r!==void 0&&(r.transformDirection(e),r.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this._transformed=!0,this}applyQuaternion(e){return $i.makeRotationFromQuaternion(e),this.applyMatrix4($i),this}rotateX(e){return $i.makeRotationX(e),this.applyMatrix4($i),this}rotateY(e){return $i.makeRotationY(e),this.applyMatrix4($i),this}rotateZ(e){return $i.makeRotationZ(e),this.applyMatrix4($i),this}translate(e,t,i){return $i.makeTranslation(e,t,i),this.applyMatrix4($i),this}scale(e,t,i){return $i.makeScale(e,t,i),this.applyMatrix4($i),this}lookAt(e){return ec.lookAt(e),ec.updateMatrix(),this.applyMatrix4(ec.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(So).negate(),this.translate(So.x,So.y,So.z),this}setFromPoints(e){let t=this.getAttribute("position");if(t===void 0){let i=[];for(let r=0,o=e.length;r<o;r++){let s=e[r];i.push(s.x,s.y,s.z||0)}this.setAttribute("position",new gt(i,3))}else{let i=Math.min(e.length,t.count);for(let r=0;r<i;r++){let o=e[r];t.setXYZ(r,o.x,o.y,o.z||0)}e.length>t.count&&Re("BufferGeometry: Buffer size too small for points data. Use .dispose() and create a new geometry."),t.needsUpdate=!0}return this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new Ji);let e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){Qe("BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.",this),this.boundingBox.set(new L(-1/0,-1/0,-1/0),new L(1/0,1/0,1/0));return}if(e!==void 0){if(this.boundingBox.setFromBufferAttribute(e),t)for(let i=0,r=t.length;i<r;i++){let o=t[i];ki.setFromBufferAttribute(o),this.morphTargetsRelative?(ti.addVectors(this.boundingBox.min,ki.min),this.boundingBox.expandByPoint(ti),ti.addVectors(this.boundingBox.max,ki.max),this.boundingBox.expandByPoint(ti)):(this.boundingBox.expandByPoint(ki.min),this.boundingBox.expandByPoint(ki.max))}}else this.boundingBox.makeEmpty();(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&Qe('BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.',this)}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new Hi);let e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){Qe("BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.",this),this.boundingSphere.set(new L,1/0);return}if(e){let i=this.boundingSphere.center;if(ki.setFromBufferAttribute(e),t)for(let o=0,s=t.length;o<s;o++){let a=t[o];Us.setFromBufferAttribute(a),this.morphTargetsRelative?(ti.addVectors(ki.min,Us.min),ki.expandByPoint(ti),ti.addVectors(ki.max,Us.max),ki.expandByPoint(ti)):(ki.expandByPoint(Us.min),ki.expandByPoint(Us.max))}ki.getCenter(i);let r=0;for(let o=0,s=e.count;o<s;o++)ti.fromBufferAttribute(e,o),r=Math.max(r,i.distanceToSquared(ti));if(t)for(let o=0,s=t.length;o<s;o++){let a=t[o],c=this.morphTargetsRelative;for(let l=0,f=a.count;l<f;l++)ti.fromBufferAttribute(a,l),c&&(So.fromBufferAttribute(e,l),ti.add(So)),r=Math.max(r,i.distanceToSquared(ti))}this.boundingSphere.radius=Math.sqrt(r),isNaN(this.boundingSphere.radius)&&Qe('BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.',this)}}computeTangents(){let e=this.index,t=this.attributes;if(e===null||t.position===void 0||t.normal===void 0||t.uv===void 0){Qe("BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)");return}let i=t.position,r=t.normal,o=t.uv,s=this.getAttribute("tangent");(s===void 0||s.count!==i.count)&&(s=new Vt(new Float32Array(4*i.count),4),this.setAttribute("tangent",s));let a=[],c=[];for(let x=0;x<i.count;x++)a[x]=new L,c[x]=new L;let l=new L,f=new L,h=new L,u=new Ne,d=new Ne,_=new Ne,v=new L,m=new L;function p(x,A,D){l.fromBufferAttribute(i,x),f.fromBufferAttribute(i,A),h.fromBufferAttribute(i,D),u.fromBufferAttribute(o,x),d.fromBufferAttribute(o,A),_.fromBufferAttribute(o,D),f.sub(l),h.sub(l),d.sub(u),_.sub(u);let G=1/(d.x*_.y-_.x*d.y);isFinite(G)&&(v.copy(f).multiplyScalar(_.y).addScaledVector(h,-d.y).multiplyScalar(G),m.copy(h).multiplyScalar(d.x).addScaledVector(f,-_.x).multiplyScalar(G),a[x].add(v),a[A].add(v),a[D].add(v),c[x].add(m),c[A].add(m),c[D].add(m))}let E=this.groups;E.length===0&&(E=[{start:0,count:e.count}]);for(let x=0,A=E.length;x<A;++x){let D=E[x],G=D.start,z=D.count;for(let Y=G,N=G+z;Y<N;Y+=3)p(e.getX(Y+0),e.getX(Y+1),e.getX(Y+2))}let C=new L,S=new L,b=new L,T=new L;function P(x){b.fromBufferAttribute(r,x),T.copy(b);let A=a[x];C.copy(A),C.sub(b.multiplyScalar(b.dot(A))).normalize(),S.crossVectors(T,A);let G=S.dot(c[x])<0?-1:1;s.setXYZW(x,C.x,C.y,C.z,G)}for(let x=0,A=E.length;x<A;++x){let D=E[x],G=D.start,z=D.count;for(let Y=G,N=G+z;Y<N;Y+=3)P(e.getX(Y+0)),P(e.getX(Y+1)),P(e.getX(Y+2))}this._transformed=!0}computeVertexNormals(){let e=this.index,t=this.getAttribute("position");if(t!==void 0){let i=this.getAttribute("normal");if(i===void 0||i.count!==t.count)i=new Vt(new Float32Array(t.count*3),3),this.setAttribute("normal",i);else for(let u=0,d=i.count;u<d;u++)i.setXYZ(u,0,0,0);let r=new L,o=new L,s=new L,a=new L,c=new L,l=new L,f=new L,h=new L;if(e)for(let u=0,d=e.count;u<d;u+=3){let _=e.getX(u+0),v=e.getX(u+1),m=e.getX(u+2);r.fromBufferAttribute(t,_),o.fromBufferAttribute(t,v),s.fromBufferAttribute(t,m),f.subVectors(s,o),h.subVectors(r,o),f.cross(h),a.fromBufferAttribute(i,_),c.fromBufferAttribute(i,v),l.fromBufferAttribute(i,m),a.add(f),c.add(f),l.add(f),i.setXYZ(_,a.x,a.y,a.z),i.setXYZ(v,c.x,c.y,c.z),i.setXYZ(m,l.x,l.y,l.z)}else for(let u=0,d=t.count;u<d;u+=3)r.fromBufferAttribute(t,u+0),o.fromBufferAttribute(t,u+1),s.fromBufferAttribute(t,u+2),f.subVectors(s,o),h.subVectors(r,o),f.cross(h),i.setXYZ(u+0,f.x,f.y,f.z),i.setXYZ(u+1,f.x,f.y,f.z),i.setXYZ(u+2,f.x,f.y,f.z);this.normalizeNormals(),i.needsUpdate=!0}}normalizeNormals(){let e=this.attributes.normal;for(let t=0,i=e.count;t<i;t++)ti.fromBufferAttribute(e,t),ti.normalize(),e.setXYZ(t,ti.x,ti.y,ti.z)}toNonIndexed(){function e(a,c){let l=a.array,f=a.itemSize,h=a.normalized,u=new l.constructor(c.length*f),d=0,_=0;for(let v=0,m=c.length;v<m;v++){a.isInterleavedBufferAttribute?d=c[v]*a.data.stride+a.offset:d=c[v]*f;for(let p=0;p<f;p++)u[_++]=l[d++]}return new Vt(u,f,h)}if(this.index===null)return Re("BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed."),this;let t=new n,i=this.index.array,r=this.attributes;for(let a in r){let c=r[a],l=e(c,i);t.setAttribute(a,l)}let o=this.morphAttributes;for(let a in o){let c=[],l=o[a];for(let f=0,h=l.length;f<h;f++){let u=l[f],d=e(u,i);c.push(d)}t.morphAttributes[a]=c}t.morphTargetsRelative=this.morphTargetsRelative;let s=this.groups;for(let a=0,c=s.length;a<c;a++){let l=s[a];t.addGroup(l.start,l.count,l.materialIndex)}return t}toJSON(){let e={metadata:{version:4.7,type:"BufferGeometry",generator:"BufferGeometry.toJSON"}};if(e.uuid=this.uuid,e.type=this.parameters!==void 0&&this._transformed===!0?"BufferGeometry":this.type,e.name=this.name,Object.keys(this.userData).length>0&&(e.userData=this.userData),this.parameters!==void 0&&this._transformed!==!0){let c=this.parameters;for(let l in c)c[l]!==void 0&&(e[l]=c[l]);return e}e.data={attributes:{}};let t=this.index;t!==null&&(e.data.index={type:t.array.constructor.name,array:Array.prototype.slice.call(t.array)});let i=this.attributes;for(let c in i){let l=i[c];e.data.attributes[c]=l.toJSON(e.data)}let r={},o=!1;for(let c in this.morphAttributes){let l=this.morphAttributes[c],f=[];for(let h=0,u=l.length;h<u;h++){let d=l[h];f.push(d.toJSON(e.data))}f.length>0&&(r[c]=f,o=!0)}o&&(e.data.morphAttributes=r,e.data.morphTargetsRelative=this.morphTargetsRelative);let s=this.groups;s.length>0&&(e.data.groups=JSON.parse(JSON.stringify(s)));let a=this.boundingSphere;return a!==null&&(e.data.boundingSphere=a.toJSON()),e}clone(){return new this.constructor().copy(this)}copy(e){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;let t={};this.name=e.name;let i=e.index;i!==null&&this.setIndex(i.clone());let r=e.attributes;for(let l in r){let f=r[l];this.setAttribute(l,f.clone(t))}let o=e.morphAttributes;for(let l in o){let f=[],h=o[l];for(let u=0,d=h.length;u<d;u++)f.push(h[u].clone(t));this.morphAttributes[l]=f}this.morphTargetsRelative=e.morphTargetsRelative;let s=e.groups;for(let l=0,f=s.length;l<f;l++){let h=s[l];this.addGroup(h.start,h.count,h.materialIndex)}let a=e.boundingBox;a!==null&&(this.boundingBox=a.clone());let c=e.boundingSphere;return c!==null&&(this.boundingSphere=c.clone()),this.drawRange.start=e.drawRange.start,this.drawRange.count=e.drawRange.count,this.userData=e.userData,this._transformed=e._transformed,this}dispose(){this.dispatchEvent({type:"dispose"})}};var tc=new L,km=new L,Wm=new Be,Mi=class{constructor(e=new L(1,0,0),t=0){this.isPlane=!0,this.normal=e,this.constant=t}set(e,t){return this.normal.copy(e),this.constant=t,this}setComponents(e,t,i,r){return this.normal.set(e,t,i),this.constant=r,this}setFromNormalAndCoplanarPoint(e,t){return this.normal.copy(e),this.constant=-t.dot(this.normal),this}setFromCoplanarPoints(e,t,i){let r=tc.subVectors(i,t).cross(km.subVectors(e,t)).normalize();return this.setFromNormalAndCoplanarPoint(r,e),this}copy(e){return this.normal.copy(e.normal),this.constant=e.constant,this}normalize(){let e=1/this.normal.length();return this.normal.multiplyScalar(e),this.constant*=e,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(e){return this.normal.dot(e)+this.constant}distanceToSphere(e){return this.distanceToPoint(e.center)-e.radius}projectPoint(e,t){return t.copy(e).addScaledVector(this.normal,-this.distanceToPoint(e))}intersectLine(e,t,i=!0){let r=e.delta(tc),o=this.normal.dot(r);if(o===0)return this.distanceToPoint(e.start)===0?t.copy(e.start):null;let s=-(e.start.dot(this.normal)+this.constant)/o;return i===!0&&(s<0||s>1)?null:t.copy(e.start).addScaledVector(r,s)}intersectsLine(e){let t=this.distanceToPoint(e.start),i=this.distanceToPoint(e.end);return t<0&&i>0||i<0&&t>0}intersectsBox(e){return e.intersectsPlane(this)}intersectsSphere(e){return e.intersectsPlane(this)}coplanarPoint(e){return e.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(e,t){let i=t||Wm.getNormalMatrix(e),r=this.coplanarPoint(tc).applyMatrix4(e),o=this.normal.applyMatrix3(i).normalize();return this.constant=-r.dot(o),this}translate(e){return this.constant-=e.dot(this.normal),this}equals(e){return e.normal.equals(this.normal)&&e.constant===this.constant}clone(){return new this.constructor().copy(this)}toJSON(){return{normal:this.normal.toArray(),constant:this.constant}}fromJSON(e){return this.normal.fromArray(e.normal),this.constant=e.constant,this}};var Xm=0,ii=class extends mi{constructor(){super(),this.isMaterial=!0,Object.defineProperty(this,"id",{value:Xm++}),this.uuid=Mn(),this.name="",this.type="Material",this.blending=Zn,this.side=Xi,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=sa,this.blendDst=aa,this.blendEquation=Kn,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.blendColor=new Ee(0,0,0),this.blendAlpha=0,this.depthFunc=Jn,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=gf,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=Ea,this.stencilZFail=Ea,this.stencilZPass=Ea,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.allowOverride=!0,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(e){this._alphaTest>0!=e>0&&this.version++,this._alphaTest=e}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(e){if(e!==void 0)for(let t in e){let i=e[t];if(i===void 0){Re(`Material: parameter '${t}' has value of undefined.`);continue}let r=this[t];if(r===void 0){Re(`Material: '${t}' is not a property of THREE.${this.type}.`);continue}r&&r.isColor?r.set(i):r&&r.isVector2&&i&&i.isVector2||r&&r.isEuler&&i&&i.isEuler||r&&r.isVector3&&i&&i.isVector3?r.copy(i):this[t]=i}}toJSON(e){let t=e===void 0||typeof e=="string";t&&(e={textures:{},images:{}});let i={metadata:{version:4.7,type:"Material",generator:"Material.toJSON"}};i.uuid=this.uuid,i.type=this.type,i.blending=this.blending,i.side=this.side,i.shadowSide=this.shadowSide,i.vertexColors=this.vertexColors,i.opacity=this.opacity,i.transparent=this.transparent,i.blendSrc=this.blendSrc,i.blendDst=this.blendDst,i.blendEquation=this.blendEquation,i.blendSrcAlpha=this.blendSrcAlpha,i.blendDstAlpha=this.blendDstAlpha,i.blendEquationAlpha=this.blendEquationAlpha,i.blendColor=this.blendColor.getHex(),i.blendAlpha=this.blendAlpha,i.depthFunc=this.depthFunc,i.depthTest=this.depthTest,i.depthWrite=this.depthWrite,i.colorWrite=this.colorWrite,i.clipIntersection=this.clipIntersection,i.clipShadows=this.clipShadows,i.stencilWriteMask=this.stencilWriteMask,i.stencilFunc=this.stencilFunc,i.stencilRef=this.stencilRef,i.stencilFuncMask=this.stencilFuncMask,i.stencilFail=this.stencilFail,i.stencilZFail=this.stencilZFail,i.stencilZPass=this.stencilZPass,i.stencilWrite=this.stencilWrite,i.polygonOffset=this.polygonOffset,i.polygonOffsetFactor=this.polygonOffsetFactor,i.polygonOffsetUnits=this.polygonOffsetUnits,i.dithering=this.dithering,i.alphaTest=this.alphaTest,i.alphaHash=this.alphaHash,i.alphaToCoverage=this.alphaToCoverage,i.premultipliedAlpha=this.premultipliedAlpha,i.forceSinglePass=this.forceSinglePass,i.allowOverride=this.allowOverride,i.visible=this.visible,i.toneMapped=this.toneMapped,i.name=this.name,this.color&&this.color.isColor&&(i.color=this.color.getHex()),this.roughness!==void 0&&(i.roughness=this.roughness),this.metalness!==void 0&&(i.metalness=this.metalness),this.sheen!==void 0&&(i.sheen=this.sheen),this.sheenColor&&this.sheenColor.isColor&&(i.sheenColor=this.sheenColor.getHex()),this.sheenRoughness!==void 0&&(i.sheenRoughness=this.sheenRoughness),this.emissive&&this.emissive.isColor&&(i.emissive=this.emissive.getHex()),this.emissiveIntensity!==void 0&&(i.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(i.specular=this.specular.getHex()),this.specularIntensity!==void 0&&(i.specularIntensity=this.specularIntensity),this.specularColor&&this.specularColor.isColor&&(i.specularColor=this.specularColor.getHex()),this.shininess!==void 0&&(i.shininess=this.shininess),this.clearcoat!==void 0&&(i.clearcoat=this.clearcoat),this.clearcoatRoughness!==void 0&&(i.clearcoatRoughness=this.clearcoatRoughness),this.clearcoatMap&&this.clearcoatMap.isTexture&&(i.clearcoatMap=this.clearcoatMap.toJSON(e).uuid),this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture&&(i.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(e).uuid),this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture&&(i.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(e).uuid,i.clearcoatNormalScale=this.clearcoatNormalScale.toArray()),this.sheenColorMap&&this.sheenColorMap.isTexture&&(i.sheenColorMap=this.sheenColorMap.toJSON(e).uuid),this.sheenRoughnessMap&&this.sheenRoughnessMap.isTexture&&(i.sheenRoughnessMap=this.sheenRoughnessMap.toJSON(e).uuid),this.dispersion!==void 0&&(i.dispersion=this.dispersion),this.retroreflectivity!==void 0&&(i.retroreflectivity=this.retroreflectivity),this.iridescence!==void 0&&(i.iridescence=this.iridescence),this.iridescenceIOR!==void 0&&(i.iridescenceIOR=this.iridescenceIOR),this.iridescenceThicknessRange!==void 0&&(i.iridescenceThicknessRange=this.iridescenceThicknessRange),this.iridescenceMap&&this.iridescenceMap.isTexture&&(i.iridescenceMap=this.iridescenceMap.toJSON(e).uuid),this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture&&(i.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(e).uuid),this.anisotropy!==void 0&&(i.anisotropy=this.anisotropy),this.anisotropyRotation!==void 0&&(i.anisotropyRotation=this.anisotropyRotation),this.anisotropyMap&&this.anisotropyMap.isTexture&&(i.anisotropyMap=this.anisotropyMap.toJSON(e).uuid),this.map&&this.map.isTexture&&(i.map=this.map.toJSON(e).uuid),this.matcap&&this.matcap.isTexture&&(i.matcap=this.matcap.toJSON(e).uuid),this.alphaMap&&this.alphaMap.isTexture&&(i.alphaMap=this.alphaMap.toJSON(e).uuid),this.lightMap&&this.lightMap.isTexture&&(i.lightMap=this.lightMap.toJSON(e).uuid,i.lightMapIntensity=this.lightMapIntensity),this.aoMap&&this.aoMap.isTexture&&(i.aoMap=this.aoMap.toJSON(e).uuid,i.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(i.bumpMap=this.bumpMap.toJSON(e).uuid,i.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(i.normalMap=this.normalMap.toJSON(e).uuid,i.normalMapType=this.normalMapType,i.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(i.displacementMap=this.displacementMap.toJSON(e).uuid,i.displacementScale=this.displacementScale,i.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(i.roughnessMap=this.roughnessMap.toJSON(e).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(i.metalnessMap=this.metalnessMap.toJSON(e).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(i.emissiveMap=this.emissiveMap.toJSON(e).uuid),this.specularMap&&this.specularMap.isTexture&&(i.specularMap=this.specularMap.toJSON(e).uuid),this.specularIntensityMap&&this.specularIntensityMap.isTexture&&(i.specularIntensityMap=this.specularIntensityMap.toJSON(e).uuid),this.specularColorMap&&this.specularColorMap.isTexture&&(i.specularColorMap=this.specularColorMap.toJSON(e).uuid),this.envMap&&this.envMap.isTexture&&(i.envMap=this.envMap.toJSON(e).uuid,this.combine!==void 0&&(i.combine=this.combine)),this.envMapRotation!==void 0&&(i.envMapRotation=this.envMapRotation.toArray()),this.envMapIntensity!==void 0&&(i.envMapIntensity=this.envMapIntensity),this.reflectivity!==void 0&&(i.reflectivity=this.reflectivity),this.refractionRatio!==void 0&&(i.refractionRatio=this.refractionRatio),this.gradientMap&&this.gradientMap.isTexture&&(i.gradientMap=this.gradientMap.toJSON(e).uuid),this.transmission!==void 0&&(i.transmission=this.transmission),this.transmissionMap&&this.transmissionMap.isTexture&&(i.transmissionMap=this.transmissionMap.toJSON(e).uuid),this.thickness!==void 0&&(i.thickness=this.thickness),this.thicknessMap&&this.thicknessMap.isTexture&&(i.thicknessMap=this.thicknessMap.toJSON(e).uuid),this.attenuationDistance!==void 0&&(i.attenuationDistance=this.attenuationDistance),this.attenuationColor!==void 0&&(i.attenuationColor=this.attenuationColor.getHex()),this.size!==void 0&&(i.size=this.size),this.sizeAttenuation!==void 0&&(i.sizeAttenuation=this.sizeAttenuation),Array.isArray(this.clippingPlanes)&&this.clippingPlanes.length>0&&(i.clippingPlanes=this.clippingPlanes.map(o=>o.toJSON())),this.rotation!==void 0&&(i.rotation=this.rotation),this.depthPacking!==void 0&&(i.depthPacking=this.depthPacking),this.linewidth!==void 0&&(i.linewidth=this.linewidth),this.linecap!==void 0&&(i.linecap=this.linecap),this.linejoin!==void 0&&(i.linejoin=this.linejoin),this.dashSize!==void 0&&(i.dashSize=this.dashSize),this.gapSize!==void 0&&(i.gapSize=this.gapSize),this.scale!==void 0&&(i.scale=this.scale),this.wireframe!==void 0&&(i.wireframe=this.wireframe),this.wireframeLinewidth!==void 0&&(i.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!==void 0&&(i.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!==void 0&&(i.wireframeLinejoin=this.wireframeLinejoin),this.flatShading!==void 0&&(i.flatShading=this.flatShading),this.fog!==void 0&&(i.fog=this.fog),Object.keys(this.userData).length>0&&(i.userData=this.userData);function r(o){let s=[];for(let a in o){let c=o[a];delete c.metadata,s.push(c)}return s}if(t){let o=r(e.textures),s=r(e.images);o.length>0&&(i.textures=o),s.length>0&&(i.images=s)}return i}fromJSON(e,t){if(e.uuid!==void 0&&(this.uuid=e.uuid),e.name!==void 0&&(this.name=e.name),e.color!==void 0&&this.color!==void 0&&this.color.setHex(e.color),e.roughness!==void 0&&(this.roughness=e.roughness),e.metalness!==void 0&&(this.metalness=e.metalness),e.sheen!==void 0&&(this.sheen=e.sheen),e.sheenColor!==void 0&&(this.sheenColor=new Ee().setHex(e.sheenColor)),e.sheenRoughness!==void 0&&(this.sheenRoughness=e.sheenRoughness),e.emissive!==void 0&&this.emissive!==void 0&&this.emissive.setHex(e.emissive),e.specular!==void 0&&this.specular!==void 0&&this.specular.setHex(e.specular),e.specularIntensity!==void 0&&(this.specularIntensity=e.specularIntensity),e.specularColor!==void 0&&this.specularColor!==void 0&&this.specularColor.setHex(e.specularColor),e.shininess!==void 0&&(this.shininess=e.shininess),e.clearcoat!==void 0&&(this.clearcoat=e.clearcoat),e.clearcoatRoughness!==void 0&&(this.clearcoatRoughness=e.clearcoatRoughness),e.dispersion!==void 0&&(this.dispersion=e.dispersion),e.retroreflectivity!==void 0&&(this.retroreflectivity=e.retroreflectivity),e.iridescence!==void 0&&(this.iridescence=e.iridescence),e.iridescenceIOR!==void 0&&(this.iridescenceIOR=e.iridescenceIOR),e.iridescenceThicknessRange!==void 0&&(this.iridescenceThicknessRange=e.iridescenceThicknessRange),e.transmission!==void 0&&(this.transmission=e.transmission),e.thickness!==void 0&&(this.thickness=e.thickness),e.attenuationDistance!==void 0&&(this.attenuationDistance=e.attenuationDistance),e.attenuationColor!==void 0&&this.attenuationColor!==void 0&&this.attenuationColor.setHex(e.attenuationColor),e.anisotropy!==void 0&&(this.anisotropy=e.anisotropy),e.anisotropyRotation!==void 0&&(this.anisotropyRotation=e.anisotropyRotation),e.fog!==void 0&&(this.fog=e.fog),e.flatShading!==void 0&&(this.flatShading=e.flatShading),e.blending!==void 0&&(this.blending=e.blending),e.combine!==void 0&&(this.combine=e.combine),e.side!==void 0&&(this.side=e.side),e.shadowSide!==void 0&&(this.shadowSide=e.shadowSide),e.opacity!==void 0&&(this.opacity=e.opacity),e.transparent!==void 0&&(this.transparent=e.transparent),e.alphaTest!==void 0&&(this.alphaTest=e.alphaTest),e.alphaHash!==void 0&&(this.alphaHash=e.alphaHash),e.depthFunc!==void 0&&(this.depthFunc=e.depthFunc),e.depthTest!==void 0&&(this.depthTest=e.depthTest),e.depthWrite!==void 0&&(this.depthWrite=e.depthWrite),e.colorWrite!==void 0&&(this.colorWrite=e.colorWrite),e.clippingPlanes!==void 0&&(this.clippingPlanes=e.clippingPlanes.map(i=>new Mi().fromJSON(i))),e.clipIntersection!==void 0&&(this.clipIntersection=e.clipIntersection),e.clipShadows!==void 0&&(this.clipShadows=e.clipShadows),e.depthPacking!==void 0&&(this.depthPacking=e.depthPacking),e.blendSrc!==void 0&&(this.blendSrc=e.blendSrc),e.blendDst!==void 0&&(this.blendDst=e.blendDst),e.blendEquation!==void 0&&(this.blendEquation=e.blendEquation),e.blendSrcAlpha!==void 0&&(this.blendSrcAlpha=e.blendSrcAlpha),e.blendDstAlpha!==void 0&&(this.blendDstAlpha=e.blendDstAlpha),e.blendEquationAlpha!==void 0&&(this.blendEquationAlpha=e.blendEquationAlpha),e.blendColor!==void 0&&this.blendColor!==void 0&&this.blendColor.setHex(e.blendColor),e.blendAlpha!==void 0&&(this.blendAlpha=e.blendAlpha),e.stencilWriteMask!==void 0&&(this.stencilWriteMask=e.stencilWriteMask),e.stencilFunc!==void 0&&(this.stencilFunc=e.stencilFunc),e.stencilRef!==void 0&&(this.stencilRef=e.stencilRef),e.stencilFuncMask!==void 0&&(this.stencilFuncMask=e.stencilFuncMask),e.stencilFail!==void 0&&(this.stencilFail=e.stencilFail),e.stencilZFail!==void 0&&(this.stencilZFail=e.stencilZFail),e.stencilZPass!==void 0&&(this.stencilZPass=e.stencilZPass),e.stencilWrite!==void 0&&(this.stencilWrite=e.stencilWrite),e.wireframe!==void 0&&(this.wireframe=e.wireframe),e.wireframeLinewidth!==void 0&&(this.wireframeLinewidth=e.wireframeLinewidth),e.wireframeLinecap!==void 0&&(this.wireframeLinecap=e.wireframeLinecap),e.wireframeLinejoin!==void 0&&(this.wireframeLinejoin=e.wireframeLinejoin),e.rotation!==void 0&&(this.rotation=e.rotation),e.linewidth!==void 0&&(this.linewidth=e.linewidth),e.linecap!==void 0&&(this.linecap=e.linecap),e.linejoin!==void 0&&(this.linejoin=e.linejoin),e.dashSize!==void 0&&(this.dashSize=e.dashSize),e.gapSize!==void 0&&(this.gapSize=e.gapSize),e.scale!==void 0&&(this.scale=e.scale),e.polygonOffset!==void 0&&(this.polygonOffset=e.polygonOffset),e.polygonOffsetFactor!==void 0&&(this.polygonOffsetFactor=e.polygonOffsetFactor),e.polygonOffsetUnits!==void 0&&(this.polygonOffsetUnits=e.polygonOffsetUnits),e.dithering!==void 0&&(this.dithering=e.dithering),e.alphaToCoverage!==void 0&&(this.alphaToCoverage=e.alphaToCoverage),e.premultipliedAlpha!==void 0&&(this.premultipliedAlpha=e.premultipliedAlpha),e.forceSinglePass!==void 0&&(this.forceSinglePass=e.forceSinglePass),e.allowOverride!==void 0&&(this.allowOverride=e.allowOverride),e.visible!==void 0&&(this.visible=e.visible),e.toneMapped!==void 0&&(this.toneMapped=e.toneMapped),e.userData!==void 0&&(this.userData=e.userData),e.vertexColors!==void 0&&(typeof e.vertexColors=="number"?this.vertexColors=e.vertexColors>0:this.vertexColors=e.vertexColors),e.size!==void 0&&(this.size=e.size),e.sizeAttenuation!==void 0&&(this.sizeAttenuation=e.sizeAttenuation),e.map!==void 0&&(this.map=t[e.map]||null),e.matcap!==void 0&&(this.matcap=t[e.matcap]||null),e.alphaMap!==void 0&&(this.alphaMap=t[e.alphaMap]||null),e.bumpMap!==void 0&&(this.bumpMap=t[e.bumpMap]||null),e.bumpScale!==void 0&&(this.bumpScale=e.bumpScale),e.normalMap!==void 0&&(this.normalMap=t[e.normalMap]||null),e.normalMapType!==void 0&&(this.normalMapType=e.normalMapType),e.normalScale!==void 0){let i=e.normalScale;Array.isArray(i)===!1&&(i=[i,i]),this.normalScale=new Ne().fromArray(i)}return e.displacementMap!==void 0&&(this.displacementMap=t[e.displacementMap]||null),e.displacementScale!==void 0&&(this.displacementScale=e.displacementScale),e.displacementBias!==void 0&&(this.displacementBias=e.displacementBias),e.roughnessMap!==void 0&&(this.roughnessMap=t[e.roughnessMap]||null),e.metalnessMap!==void 0&&(this.metalnessMap=t[e.metalnessMap]||null),e.emissiveMap!==void 0&&(this.emissiveMap=t[e.emissiveMap]||null),e.emissiveIntensity!==void 0&&(this.emissiveIntensity=e.emissiveIntensity),e.specularMap!==void 0&&(this.specularMap=t[e.specularMap]||null),e.specularIntensityMap!==void 0&&(this.specularIntensityMap=t[e.specularIntensityMap]||null),e.specularColorMap!==void 0&&(this.specularColorMap=t[e.specularColorMap]||null),e.envMap!==void 0&&(this.envMap=t[e.envMap]||null),e.envMapRotation!==void 0&&this.envMapRotation.fromArray(e.envMapRotation),e.envMapIntensity!==void 0&&(this.envMapIntensity=e.envMapIntensity),e.reflectivity!==void 0&&(this.reflectivity=e.reflectivity),e.refractionRatio!==void 0&&(this.refractionRatio=e.refractionRatio),e.lightMap!==void 0&&(this.lightMap=t[e.lightMap]||null),e.lightMapIntensity!==void 0&&(this.lightMapIntensity=e.lightMapIntensity),e.aoMap!==void 0&&(this.aoMap=t[e.aoMap]||null),e.aoMapIntensity!==void 0&&(this.aoMapIntensity=e.aoMapIntensity),e.gradientMap!==void 0&&(this.gradientMap=t[e.gradientMap]||null),e.clearcoatMap!==void 0&&(this.clearcoatMap=t[e.clearcoatMap]||null),e.clearcoatRoughnessMap!==void 0&&(this.clearcoatRoughnessMap=t[e.clearcoatRoughnessMap]||null),e.clearcoatNormalMap!==void 0&&(this.clearcoatNormalMap=t[e.clearcoatNormalMap]||null),e.clearcoatNormalScale!==void 0&&(this.clearcoatNormalScale=new Ne().fromArray(e.clearcoatNormalScale)),e.iridescenceMap!==void 0&&(this.iridescenceMap=t[e.iridescenceMap]||null),e.iridescenceThicknessMap!==void 0&&(this.iridescenceThicknessMap=t[e.iridescenceThicknessMap]||null),e.transmissionMap!==void 0&&(this.transmissionMap=t[e.transmissionMap]||null),e.thicknessMap!==void 0&&(this.thicknessMap=t[e.thicknessMap]||null),e.anisotropyMap!==void 0&&(this.anisotropyMap=t[e.anisotropyMap]||null),e.sheenColorMap!==void 0&&(this.sheenColorMap=t[e.sheenColorMap]||null),e.sheenRoughnessMap!==void 0&&(this.sheenRoughnessMap=t[e.sheenRoughnessMap]||null),this}clone(){return new this.constructor().copy(this)}copy(e){this.name=e.name,this.blending=e.blending,this.side=e.side,this.vertexColors=e.vertexColors,this.opacity=e.opacity,this.transparent=e.transparent,this.blendSrc=e.blendSrc,this.blendDst=e.blendDst,this.blendEquation=e.blendEquation,this.blendSrcAlpha=e.blendSrcAlpha,this.blendDstAlpha=e.blendDstAlpha,this.blendEquationAlpha=e.blendEquationAlpha,this.blendColor.copy(e.blendColor),this.blendAlpha=e.blendAlpha,this.depthFunc=e.depthFunc,this.depthTest=e.depthTest,this.depthWrite=e.depthWrite,this.stencilWriteMask=e.stencilWriteMask,this.stencilFunc=e.stencilFunc,this.stencilRef=e.stencilRef,this.stencilFuncMask=e.stencilFuncMask,this.stencilFail=e.stencilFail,this.stencilZFail=e.stencilZFail,this.stencilZPass=e.stencilZPass,this.stencilWrite=e.stencilWrite;let t=e.clippingPlanes,i=null;if(t!==null){let r=t.length;i=new Array(r);for(let o=0;o!==r;++o)i[o]=t[o].clone()}return this.clippingPlanes=i,this.clipIntersection=e.clipIntersection,this.clipShadows=e.clipShadows,this.shadowSide=e.shadowSide,this.colorWrite=e.colorWrite,this.precision=e.precision,this.polygonOffset=e.polygonOffset,this.polygonOffsetFactor=e.polygonOffsetFactor,this.polygonOffsetUnits=e.polygonOffsetUnits,this.dithering=e.dithering,this.alphaTest=e.alphaTest,this.alphaHash=e.alphaHash,this.alphaToCoverage=e.alphaToCoverage,this.premultipliedAlpha=e.premultipliedAlpha,this.forceSinglePass=e.forceSinglePass,this.allowOverride=e.allowOverride,this.visible=e.visible,this.toneMapped=e.toneMapped,this.userData=JSON.parse(JSON.stringify(e.userData)),this}dispose(){this.dispatchEvent({type:"dispose"})}set needsUpdate(e){e===!0&&this.version++}};var Nn=new L,ic=new L,Oa=new L,Ba=new L,yo=class{constructor(e=new L,t=new L(0,0,-1)){this.origin=e,this.direction=t}set(e,t){return this.origin.copy(e),this.direction.copy(t),this}copy(e){return this.origin.copy(e.origin),this.direction.copy(e.direction),this}at(e,t){return t.copy(this.origin).addScaledVector(this.direction,e)}lookAt(e){return this.direction.copy(e).sub(this.origin).normalize(),this}recast(e){return this.origin.copy(this.at(e,Nn)),this}closestPointToPoint(e,t){t.subVectors(e,this.origin);let i=t.dot(this.direction);return i<0?t.copy(this.origin):t.copy(this.origin).addScaledVector(this.direction,i)}distanceToPoint(e){return Math.sqrt(this.distanceSqToPoint(e))}distanceSqToPoint(e){let t=Nn.subVectors(e,this.origin).dot(this.direction);return t<0?this.origin.distanceToSquared(e):(Nn.copy(this.origin).addScaledVector(this.direction,t),Nn.distanceToSquared(e))}distanceSqToSegment(e,t,i,r){ic.copy(e).add(t).multiplyScalar(.5),Oa.copy(t).sub(e).normalize(),Ba.copy(this.origin).sub(ic);let o=e.distanceTo(t)*.5,s=-this.direction.dot(Oa),a=Ba.dot(this.direction),c=-Ba.dot(Oa),l=Ba.lengthSq(),f=Math.abs(1-s*s),h,u,d,_;if(f>0)if(h=s*c-a,u=s*a-c,_=o*f,h>=0)if(u>=-_)if(u<=_){let v=1/f;h*=v,u*=v,d=h*(h+s*u+2*a)+u*(s*h+u+2*c)+l}else u=o,h=Math.max(0,-(s*u+a)),d=-h*h+u*(u+2*c)+l;else u=-o,h=Math.max(0,-(s*u+a)),d=-h*h+u*(u+2*c)+l;else u<=-_?(h=Math.max(0,-(-s*o+a)),u=h>0?-o:Math.min(Math.max(-o,-c),o),d=-h*h+u*(u+2*c)+l):u<=_?(h=0,u=Math.min(Math.max(-o,-c),o),d=u*(u+2*c)+l):(h=Math.max(0,-(s*o+a)),u=h>0?o:Math.min(Math.max(-o,-c),o),d=-h*h+u*(u+2*c)+l);else u=s>0?-o:o,h=Math.max(0,-(s*u+a)),d=-h*h+u*(u+2*c)+l;return i&&i.copy(this.origin).addScaledVector(this.direction,h),r&&r.copy(ic).addScaledVector(Oa,u),d}intersectSphere(e,t){if(e.radius<0)return null;Nn.subVectors(e.center,this.origin);let i=Nn.dot(this.direction),r=Nn.dot(Nn)-i*i,o=e.radius*e.radius;if(r>o)return null;let s=Math.sqrt(o-r),a=i-s,c=i+s;return c<0?null:a<0?this.at(c,t):this.at(a,t)}intersectsSphere(e){return e.radius<0?!1:this.distanceSqToPoint(e.center)<=e.radius*e.radius}distanceToPlane(e){let t=e.normal.dot(this.direction);if(t===0)return e.distanceToPoint(this.origin)===0?0:null;let i=-(this.origin.dot(e.normal)+e.constant)/t;return i>=0?i:null}intersectPlane(e,t){let i=this.distanceToPlane(e);return i===null?null:this.at(i,t)}intersectsPlane(e){let t=e.distanceToPoint(this.origin);return t===0||e.normal.dot(this.direction)*t<0}intersectBox(e,t){let i,r,o,s,a,c,l=1/this.direction.x,f=1/this.direction.y,h=1/this.direction.z,u=this.origin;return l>=0?(i=(e.min.x-u.x)*l,r=(e.max.x-u.x)*l):(i=(e.max.x-u.x)*l,r=(e.min.x-u.x)*l),f>=0?(o=(e.min.y-u.y)*f,s=(e.max.y-u.y)*f):(o=(e.max.y-u.y)*f,s=(e.min.y-u.y)*f),i>s||o>r||((o>i||isNaN(i))&&(i=o),(s<r||isNaN(r))&&(r=s),h>=0?(a=(e.min.z-u.z)*h,c=(e.max.z-u.z)*h):(a=(e.max.z-u.z)*h,c=(e.min.z-u.z)*h),i>c||a>r)||((a>i||i!==i)&&(i=a),(c<r||r!==r)&&(r=c),r<0)?null:this.at(i>=0?i:r,t)}intersectsBox(e){return this.intersectBox(e,Nn)!==null}intersectTriangle(e,t,i,r,o){let s=this.origin,a=this.direction,c=a.x,l=a.y,f=a.z,h=e.x-s.x,u=e.y-s.y,d=e.z-s.z,_=t.x-s.x,v=t.y-s.y,m=t.z-s.z,p=i.x-s.x,E=i.y-s.y,C=i.z-s.z,S=Math.abs(c),b=Math.abs(l),T=Math.abs(f),P,x,A,D,G,z,Y,N,F,te,$,ae;if(S>=b&&S>=T?(A=c,z=h,F=_,ae=p,c>=0?(P=l,x=f,D=u,G=d,Y=v,N=m,te=E,$=C):(P=f,x=l,D=d,G=u,Y=m,N=v,te=C,$=E)):b>=T?(A=l,z=u,F=v,ae=E,l>=0?(P=f,x=c,D=d,G=h,Y=m,N=_,te=C,$=p):(P=c,x=f,D=h,G=d,Y=_,N=m,te=p,$=C)):(A=f,z=d,F=m,ae=C,f>=0?(P=c,x=l,D=h,G=u,Y=_,N=v,te=p,$=E):(P=l,x=c,D=u,G=h,Y=v,N=_,te=E,$=p)),A===0)return null;let j=P/A,re=x/A,oe=1/A,Ge=D-j*z,Oe=G-re*z,Dt=Y-j*F,at=N-re*F,ct=te-j*ae,xt=$-re*ae,ye=ct*at-xt*Dt,pt=Ge*xt-Oe*ct,Gt=Dt*Oe-at*Ge;if(r){if(ye<0||pt<0||Gt<0)return null}else if((ye<0||pt<0||Gt<0)&&(ye>0||pt>0||Gt>0))return null;let Ie=ye+pt+Gt;if(Ie===0)return null;let Et=oe*(ye*z+pt*F+Gt*ae);return(Ie>0?Et<0:Et>0)?null:this.at(Et/Ie,o)}applyMatrix4(e){return this.origin.applyMatrix4(e),this.direction.transformDirection(e),this}equals(e){return e.origin.equals(this.origin)&&e.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}};var vn=class extends ii{constructor(e){super(),this.isMeshBasicMaterial=!0,this.type="MeshBasicMaterial",this.color=new Ee(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new Ui,this.combine=kr,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.specularMap=e.specularMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.combine=e.combine,this.reflectivity=e.reflectivity,this.refractionRatio=e.refractionRatio,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.fog=e.fog,this}};var kf=new Ze,Cr=new yo,Ga=new Hi,Wf=new L,za=new L,Va=new L,Ha=new L,nc=new L,ka=new L,Xf=new L,Wa=new L,We=class extends dt{constructor(e=new Ct,t=new vn){super(),this.isMesh=!0,this.type="Mesh",this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.count=1,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),e.morphTargetInfluences!==void 0&&(this.morphTargetInfluences=e.morphTargetInfluences.slice()),e.morphTargetDictionary!==void 0&&(this.morphTargetDictionary=Object.assign({},e.morphTargetDictionary)),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}updateMorphTargets(){let t=this.geometry.morphAttributes,i=Object.keys(t);if(i.length>0){let r=t[i[0]];if(r!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let o=0,s=r.length;o<s;o++){let a=r[o].name||String(o);this.morphTargetInfluences.push(0),this.morphTargetDictionary[a]=o}}}}getVertexPosition(e,t){let i=this.geometry,r=i.attributes.position,o=i.morphAttributes.position,s=i.morphTargetsRelative;t.fromBufferAttribute(r,e);let a=this.morphTargetInfluences;if(o&&a){ka.set(0,0,0);for(let c=0,l=o.length;c<l;c++){let f=a[c],h=o[c];f!==0&&(nc.fromBufferAttribute(h,e),s?ka.addScaledVector(nc,f):ka.addScaledVector(nc.sub(t),f))}t.add(ka)}return t}intersectsFrustum(e){return e.intersectsObject(this)}raycast(e,t){let i=this.geometry,r=this.material,o=this.matrixWorld;r!==void 0&&(i.boundingSphere===null&&i.computeBoundingSphere(),Ga.copy(i.boundingSphere),Ga.applyMatrix4(o),Cr.copy(e.ray).recast(e.near),!(Ga.containsPoint(Cr.origin)===!1&&(Cr.intersectSphere(Ga,Wf)===null||Cr.origin.distanceToSquared(Wf)>(e.far-e.near)**2))&&(kf.copy(o).invert(),Cr.copy(e.ray).applyMatrix4(kf),!(i.boundingBox!==null&&Cr.intersectsBox(i.boundingBox)===!1)&&this._computeIntersections(e,t,Cr)))}_computeIntersections(e,t,i){let r,o=this.geometry,s=this.material,a=o.index,c=o.attributes.position,l=o.attributes.uv,f=o.attributes.uv1,h=o.attributes.normal,u=o.groups,d=o.drawRange;if(a!==null)if(Array.isArray(s))for(let _=0,v=u.length;_<v;_++){let m=u[_],p=s[m.materialIndex],E=Math.max(m.start,d.start),C=Math.min(a.count,Math.min(m.start+m.count,d.start+d.count));for(let S=E,b=C;S<b;S+=3){let T=a.getX(S),P=a.getX(S+1),x=a.getX(S+2);r=Xa(this,p,e,i,l,f,h,T,P,x),r&&(r.faceIndex=Math.floor(S/3),r.face.materialIndex=m.materialIndex,t.push(r))}}else{let _=Math.max(0,d.start),v=Math.min(a.count,d.start+d.count);for(let m=_,p=v;m<p;m+=3){let E=a.getX(m),C=a.getX(m+1),S=a.getX(m+2);r=Xa(this,s,e,i,l,f,h,E,C,S),r&&(r.faceIndex=Math.floor(m/3),t.push(r))}}else if(c!==void 0)if(Array.isArray(s))for(let _=0,v=u.length;_<v;_++){let m=u[_],p=s[m.materialIndex],E=Math.max(m.start,d.start),C=Math.min(c.count,Math.min(m.start+m.count,d.start+d.count));for(let S=E,b=C;S<b;S+=3){let T=S,P=S+1,x=S+2;r=Xa(this,p,e,i,l,f,h,T,P,x),r&&(r.faceIndex=Math.floor(S/3),r.face.materialIndex=m.materialIndex,t.push(r))}}else{let _=Math.max(0,d.start),v=Math.min(c.count,d.start+d.count);for(let m=_,p=v;m<p;m+=3){let E=m,C=m+1,S=m+2;r=Xa(this,s,e,i,l,f,h,E,C,S),r&&(r.faceIndex=Math.floor(m/3),t.push(r))}}}};function qm(n,e,t,i,r,o,s,a){let c;if(e.side===Rt?c=i.intersectTriangle(s,o,r,!0,a):c=i.intersectTriangle(r,o,s,e.side===Xi,a),c===null)return null;Wa.copy(a),Wa.applyMatrix4(n.matrixWorld);let l=t.ray.origin.distanceTo(Wa);return l<t.near||l>t.far?null:{distance:l,point:Wa.clone(),object:n}}function Xa(n,e,t,i,r,o,s,a,c,l){n.getVertexPosition(a,za),n.getVertexPosition(c,Va),n.getVertexPosition(l,Ha);let f=qm(n,e,t,i,za,Va,Ha,Xf);if(f){let h=new L;tr.getBarycoord(Xf,za,Va,Ha,h),r&&(f.uv=tr.getInterpolatedAttribute(r,a,c,l,h,new Ne)),o&&(f.uv1=tr.getInterpolatedAttribute(o,a,c,l,h,new Ne)),s&&(f.normal=tr.getInterpolatedAttribute(s,a,c,l,h,new L),f.normal.dot(i.direction)>0&&f.normal.multiplyScalar(-1));let u={a,b:c,c:l,normal:new L,materialIndex:0};tr.getNormal(za,Va,Ha,u.normal),f.face=u,f.barycoord=h}return f}var Eo=class extends kt{constructor(e=null,t=1,i=1,r,o,s,a,c,l=Ut,f=Ut,h,u){super(null,s,a,c,l,f,r,o,h,u),this.isDataTexture=!0,this.image={data:e,width:t,height:i},this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}};var bo=class extends Vt{constructor(e,t,i,r=1){super(e,t,i),this.isInstancedBufferAttribute=!0,this.meshPerAttribute=r}copy(e){return super.copy(e),this.meshPerAttribute=e.meshPerAttribute,this}toJSON(){let e=super.toJSON();return e.meshPerAttribute=this.meshPerAttribute,e.isInstancedBufferAttribute=!0,e}};var To=new Ze,qf=new Ze,qa=[],Yf=new Ji,Ym=new Ze,Ns=new We,Os=new Hi,Bs=class extends We{constructor(e,t,i){super(e,t),this.isInstancedMesh=!0,this.instanceMatrix=new bo(new Float32Array(i*16),16),this.instanceColor=null,this.morphTexture=null,this.count=i,this.boundingBox=null,this.boundingSphere=null;for(let r=0;r<i;r++)this.setMatrixAt(r,Ym)}computeBoundingBox(){let e=this.geometry,t=this.count;this.boundingBox===null&&(this.boundingBox=new Ji),e.boundingBox===null&&e.computeBoundingBox(),this.boundingBox.makeEmpty();for(let i=0;i<t;i++)this.getMatrixAt(i,To),Yf.copy(e.boundingBox).applyMatrix4(To),this.boundingBox.union(Yf)}computeBoundingSphere(){let e=this.geometry,t=this.count;this.boundingSphere===null&&(this.boundingSphere=new Hi),e.boundingSphere===null&&e.computeBoundingSphere(),this.boundingSphere.makeEmpty();for(let i=0;i<t;i++)this.getMatrixAt(i,To),Os.copy(e.boundingSphere).applyMatrix4(To),this.boundingSphere.union(Os)}copy(e,t){return super.copy(e,t),this.instanceMatrix.copy(e.instanceMatrix),e.morphTexture!==null&&(this.morphTexture=e.morphTexture.clone()),e.instanceColor!==null&&(this.instanceColor=e.instanceColor.clone()),this.count=e.count,e.boundingBox!==null&&(this.boundingBox=e.boundingBox.clone()),e.boundingSphere!==null&&(this.boundingSphere=e.boundingSphere.clone()),this}getColorAt(e,t){return this.instanceColor===null?t.setRGB(1,1,1):t.fromArray(this.instanceColor.array,e*3)}getMatrixAt(e,t){return t.fromArray(this.instanceMatrix.array,e*16)}getMorphAt(e,t){let i=t.morphTargetInfluences,r=this.morphTexture.source.data.data,o=i.length+1,s=e*o+1;for(let a=0;a<i.length;a++)i[a]=r[s+a]}raycast(e,t){let i=this.matrixWorld,r=this.count;if(Ns.geometry=this.geometry,Ns.material=this.material,Ns.material!==void 0&&(this.boundingSphere===null&&this.computeBoundingSphere(),Os.copy(this.boundingSphere),Os.applyMatrix4(i),e.ray.intersectsSphere(Os)!==!1))for(let o=0;o<r;o++){this.getMatrixAt(o,To),qf.multiplyMatrices(i,To),Ns.matrixWorld=qf,Ns.raycast(e,qa);for(let s=0,a=qa.length;s<a;s++){let c=qa[s];c.instanceId=o,c.object=this,t.push(c)}qa.length=0}}setColorAt(e,t){return this.instanceColor===null&&(this.instanceColor=new bo(new Float32Array(this.instanceMatrix.count*3).fill(1),3)),t.toArray(this.instanceColor.array,e*3),this}setMatrixAt(e,t){return t.toArray(this.instanceMatrix.array,e*16),this}setMorphAt(e,t){let i=t.morphTargetInfluences,r=i.length+1;this.morphTexture===null&&(this.morphTexture=new Eo(new Float32Array(r*this.count),r,this.count,Zr,Kt));let o=this.morphTexture.source.data.data,s=0;for(let l=0;l<i.length;l++)s+=i[l];let a=this.geometry.morphTargetsRelative?1:1-s,c=r*e;return o[c]=a,o.set(i,c+1),this}updateMorphTargets(){}dispose(){super.dispose(),this.morphTexture!==null&&(this.morphTexture.dispose(),this.morphTexture=null)}};var Pr=new Hi,Zm=new Ne(.5,.5),Ya=new L,rr=class{constructor(e=new Mi,t=new Mi,i=new Mi,r=new Mi,o=new Mi,s=new Mi){this.planes=[e,t,i,r,o,s]}set(e,t,i,r,o,s){let a=this.planes;return a[0].copy(e),a[1].copy(t),a[2].copy(i),a[3].copy(r),a[4].copy(o),a[5].copy(s),this}copy(e){let t=this.planes;for(let i=0;i<6;i++)t[i].copy(e.planes[i]);return this}setFromProjectionMatrix(e,t=Pi,i=!1){let r=this.planes,o=e.elements,s=o[0],a=o[1],c=o[2],l=o[3],f=o[4],h=o[5],u=o[6],d=o[7],_=o[8],v=o[9],m=o[10],p=o[11],E=o[12],C=o[13],S=o[14],b=o[15];if(r[0].setComponents(l-s,d-f,p-_,b-E).normalize(),r[1].setComponents(l+s,d+f,p+_,b+E).normalize(),r[2].setComponents(l+a,d+h,p+v,b+C).normalize(),r[3].setComponents(l-a,d-h,p-v,b-C).normalize(),i)r[4].setComponents(c,u,m,S).normalize(),r[5].setComponents(l-c,d-u,p-m,b-S).normalize();else if(r[4].setComponents(l-c,d-u,p-m,b-S).normalize(),t===Pi)r[5].setComponents(l+c,d+u,p+m,b+S).normalize();else if(t===Ln)r[5].setComponents(c,u,m,S).normalize();else throw new Error("THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: "+t);return this}intersectsObject(e){if(e.boundingSphere!==void 0)e.boundingSphere===null&&e.computeBoundingSphere(),Pr.copy(e.boundingSphere).applyMatrix4(e.matrixWorld);else{let t=e.geometry;t.boundingSphere===null&&t.computeBoundingSphere(),Pr.copy(t.boundingSphere).applyMatrix4(e.matrixWorld)}return this.intersectsSphere(Pr)}intersectsSprite(e){Pr.center.set(0,0,0);let t=Zm.distanceTo(e.center);return Pr.radius=.7071067811865476+t,Pr.applyMatrix4(e.matrixWorld),this.intersectsSphere(Pr)}intersectsSphere(e){let t=this.planes,i=e.center,r=-e.radius;for(let o=0;o<6;o++)if(t[o].distanceToPoint(i)<r)return!1;return!0}intersectsBox(e){let t=this.planes;for(let i=0;i<6;i++){let r=t[i];if(Ya.x=r.normal.x>0?e.max.x:e.min.x,Ya.y=r.normal.y>0?e.max.y:e.min.y,Ya.z=r.normal.z>0?e.max.z:e.min.z,r.distanceToPoint(Ya)<0)return!1}return!0}containsPoint(e){let t=this.planes;for(let i=0;i<6;i++)if(t[i].distanceToPoint(e)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}};var Lr=class extends ii{constructor(e){super(),this.isLineBasicMaterial=!0,this.type="LineBasicMaterial",this.color=new Ee(16777215),this.map=null,this.linewidth=1,this.linecap="round",this.linejoin="round",this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.linewidth=e.linewidth,this.linecap=e.linecap,this.linejoin=e.linejoin,this.fog=e.fog,this}};var Ja=new L,$a=new L,Zf=new Ze,Gs=new yo,Za=new Hi,rc=new L,Kf=new L,Qa=class extends dt{constructor(e=new Ct,t=new Lr){super(),this.isLine=!0,this.type="Line",this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}computeLineDistances(){let e=this.geometry;if(e.index===null){let t=e.attributes.position,i=[0];for(let r=1,o=t.count;r<o;r++)Ja.fromBufferAttribute(t,r-1),$a.fromBufferAttribute(t,r),i[r]=i[r-1],i[r]+=Ja.distanceTo($a);e.setAttribute("lineDistance",new gt(i,1))}else Re("Line.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}intersectsFrustum(e){return e.intersectsObject(this)}raycast(e,t){let i=this.geometry,r=this.matrixWorld,o=e.params.Line.threshold,s=i.drawRange;if(i.boundingSphere===null&&i.computeBoundingSphere(),Za.copy(i.boundingSphere),Za.applyMatrix4(r),Za.radius+=o,e.ray.intersectsSphere(Za)===!1)return;Zf.copy(r).invert(),Gs.copy(e.ray).applyMatrix4(Zf);let a=o/((this.scale.x+this.scale.y+this.scale.z)/3),c=a*a,l=this.isLineSegments?2:1,f=i.index,u=i.attributes.position;if(f!==null){let d=Math.max(0,s.start),_=Math.min(f.count,s.start+s.count);for(let v=d,m=_-1;v<m;v+=l){let p=f.getX(v),E=f.getX(v+1),C=Ka(this,e,Gs,c,p,E,v);C&&t.push(C)}if(this.isLineLoop){let v=f.getX(_-1),m=f.getX(d),p=Ka(this,e,Gs,c,v,m,_-1);p&&t.push(p)}}else{let d=Math.max(0,s.start),_=Math.min(u.count,s.start+s.count);for(let v=d,m=_-1;v<m;v+=l){let p=Ka(this,e,Gs,c,v,v+1,v);p&&t.push(p)}if(this.isLineLoop){let v=Ka(this,e,Gs,c,_-1,d,_-1);v&&t.push(v)}}}updateMorphTargets(){let t=this.geometry.morphAttributes,i=Object.keys(t);if(i.length>0){let r=t[i[0]];if(r!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let o=0,s=r.length;o<s;o++){let a=r[o].name||String(o);this.morphTargetInfluences.push(0),this.morphTargetDictionary[a]=o}}}}};function Ka(n,e,t,i,r,o,s){let a=n.geometry.attributes.position;if(Ja.fromBufferAttribute(a,r),$a.fromBufferAttribute(a,o),t.distanceSqToSegment(Ja,$a,rc,Kf)>i)return;rc.applyMatrix4(n.matrixWorld);let l=e.ray.origin.distanceTo(rc);if(!(l<e.near||l>e.far))return{distance:l,point:Kf.clone().applyMatrix4(n.matrixWorld),index:s,face:null,faceIndex:null,barycoord:null,object:n}}var Jf=new L,$f=new L,Ao=class extends Qa{constructor(e,t){super(e,t),this.isLineSegments=!0,this.type="LineSegments"}computeLineDistances(){let e=this.geometry;if(e.index===null){let t=e.attributes.position,i=[];for(let r=0,o=t.count;r<o;r+=2)Jf.fromBufferAttribute(t,r),$f.fromBufferAttribute(t,r+1),i[r]=r===0?0:i[r-1],i[r+1]=i[r]+Jf.distanceTo($f);e.setAttribute("lineDistance",new gt(i,1))}else Re("LineSegments.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}};var wo=class extends kt{constructor(e=[],t=qi,i,r,o,s,a,c,l,f){super(e,t,i,r,o,s,a,c,l,f),this.isCubeTexture=!0,this.flipY=!1}get images(){return this.image}set images(e){this.image=e}};var zs=class extends kt{constructor(e,t,i,r,o,s,a,c,l){super(e,t,i,r,o,s,a,c,l),this.isCanvasTexture=!0,this.needsUpdate=!0}};var On=class extends kt{constructor(e,t,i=pi,r,o,s,a=Ut,c=Ut,l,f=Gi,h=1){if(f!==Gi&&f!==Pn)throw new Error("THREE.DepthTexture: format must be either THREE.DepthFormat or THREE.DepthStencilFormat");let u={width:e,height:t,depth:h};super(u,r,o,s,a,c,f,i,l),this.isDepthTexture=!0,this.flipY=!1,this.generateMipmaps=!1,this.compareFunction=null}copy(e){return super.copy(e),this.source=new Qn(Object.assign({},e.image)),this.compareFunction=e.compareFunction,this}toJSON(e){let t=super.toJSON(e);return t.compareFunction=this.compareFunction,t}};var ja=class extends On{constructor(e,t=pi,i=qi,r,o,s=Ut,a=Ut,c,l=Gi){let f={width:e,height:e,depth:1},h=[f,f,f,f,f,f];super(e,e,t,i,r,o,s,a,c,l),this.image=h,this.isCubeDepthTexture=!0,this.isCubeTexture=!0}get images(){return this.image}set images(e){this.image=e}};var vi=class n extends Ct{constructor(e=1,t=1,i=1,r=1,o=1,s=1){super(),this.type="BoxGeometry",this.parameters={width:e,height:t,depth:i,widthSegments:r,heightSegments:o,depthSegments:s};let a=this;r=Math.floor(r),o=Math.floor(o),s=Math.floor(s);let c=[],l=[],f=[],h=[],u=0,d=0;_("z","y","x",-1,-1,i,t,e,s,o,0),_("z","y","x",1,-1,i,t,-e,s,o,1),_("x","z","y",1,1,e,i,t,r,s,2),_("x","z","y",1,-1,e,i,-t,r,s,3),_("x","y","z",1,-1,e,t,i,r,o,4),_("x","y","z",-1,-1,e,t,-i,r,o,5),this.setIndex(c),this.setAttribute("position",new gt(l,3)),this.setAttribute("normal",new gt(f,3)),this.setAttribute("uv",new gt(h,2));function _(v,m,p,E,C,S,b,T,P,x,A){let D=S/P,G=b/x,z=S/2,Y=b/2,N=T/2,F=P+1,te=x+1,$=0,ae=0,j=new L;for(let re=0;re<te;re++){let oe=re*G-Y;for(let Ge=0;Ge<F;Ge++){let Oe=Ge*D-z;j[v]=Oe*E,j[m]=oe*C,j[p]=N,l.push(j.x,j.y,j.z),j[v]=0,j[m]=0,j[p]=T>0?1:-1,f.push(j.x,j.y,j.z),h.push(Ge/P),h.push(1-re/x),$+=1}}for(let re=0;re<x;re++)for(let oe=0;oe<P;oe++){let Ge=u+oe+F*re,Oe=u+oe+F*(re+1),Dt=u+(oe+1)+F*(re+1),at=u+(oe+1)+F*re;c.push(Ge,Oe,at),c.push(Oe,Dt,at),ae+=6}a.addGroup(d,ae,A),d+=ae,u+=$}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new n(e.width,e.height,e.depth,e.widthSegments,e.heightSegments,e.depthSegments)}};var el=class n extends Ct{constructor(e=1,t=1,i=1,r=32,o=1,s=!1,a=0,c=Math.PI*2){super(),this.type="CylinderGeometry",this.parameters={radiusTop:e,radiusBottom:t,height:i,radialSegments:r,heightSegments:o,openEnded:s,thetaStart:a,thetaLength:c};let l=this;r=Math.floor(r),o=Math.floor(o);let f=[],h=[],u=[],d=[],_=0,v=[],m=i/2,p=0;E(),s===!1&&(e>0&&C(!0),t>0&&C(!1)),this.setIndex(f),this.setAttribute("position",new gt(h,3)),this.setAttribute("normal",new gt(u,3)),this.setAttribute("uv",new gt(d,2));function E(){let S=new L,b=new L,T=0,P=(t-e)/i;for(let x=0;x<=o;x++){let A=[],D=x/o,G=D*(t-e)+e;for(let z=0;z<=r;z++){let Y=z/r,N=Y*c+a,F=Math.sin(N),te=Math.cos(N);b.x=G*F,b.y=-D*i+m,b.z=G*te,h.push(b.x,b.y,b.z),S.set(F,P,te).normalize(),u.push(S.x,S.y,S.z),d.push(Y,1-D),A.push(_++)}v.push(A)}for(let x=0;x<r;x++)for(let A=0;A<o;A++){let D=v[A][x],G=v[A+1][x],z=v[A+1][x+1],Y=v[A][x+1];(e>0||A!==0)&&(f.push(D,G,Y),T+=3),(t>0||A!==o-1)&&(f.push(G,z,Y),T+=3)}l.addGroup(p,T,0),p+=T}function C(S){let b=_,T=new Ne,P=new L,x=0,A=S===!0?e:t,D=S===!0?1:-1;for(let z=1;z<=r;z++)h.push(0,m*D,0),u.push(0,D,0),d.push(.5,.5),_++;let G=_;for(let z=0;z<=r;z++){let N=z/r*c+a,F=Math.cos(N),te=Math.sin(N);P.x=A*te,P.y=m*D,P.z=A*F,h.push(P.x,P.y,P.z),u.push(0,D,0),T.x=F*.5+.5,T.y=te*.5*D+.5,d.push(T.x,T.y),_++}for(let z=0;z<r;z++){let Y=b+z,N=G+z;S===!0?f.push(N,N+1,Y):f.push(N+1,N,Y),x+=3}l.addGroup(p,x,S===!0?1:2),p+=x}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new n(e.radiusTop,e.radiusBottom,e.height,e.radialSegments,e.heightSegments,e.openEnded,e.thetaStart,e.thetaLength)}};var tl=class n extends Ct{constructor(e=[],t=[],i=1,r=0){super(),this.type="PolyhedronGeometry",this.parameters={vertices:e,indices:t,radius:i,detail:r};let o=[],s=[];a(r),l(i),f(),this.setAttribute("position",new gt(o,3)),this.setAttribute("normal",new gt(o.slice(),3)),this.setAttribute("uv",new gt(s,2)),r===0?this.computeVertexNormals():this.normalizeNormals();function a(E){let C=new L,S=new L,b=new L;for(let T=0;T<t.length;T+=3)d(t[T+0],C),d(t[T+1],S),d(t[T+2],b),c(C,S,b,E)}function c(E,C,S,b){let T=b+1,P=[];for(let x=0;x<=T;x++){P[x]=[];let A=E.clone().lerp(S,x/T),D=C.clone().lerp(S,x/T),G=T-x;for(let z=0;z<=G;z++)z===0&&x===T?P[x][z]=A:P[x][z]=A.clone().lerp(D,z/G)}for(let x=0;x<T;x++)for(let A=0;A<2*(T-x)-1;A++){let D=Math.floor(A/2);A%2===0?(u(P[x][D+1]),u(P[x+1][D]),u(P[x][D])):(u(P[x][D+1]),u(P[x+1][D+1]),u(P[x+1][D]))}}function l(E){let C=new L;for(let S=0;S<o.length;S+=3)C.x=o[S+0],C.y=o[S+1],C.z=o[S+2],C.normalize().multiplyScalar(E),o[S+0]=C.x,o[S+1]=C.y,o[S+2]=C.z}function f(){let E=new L;for(let C=0;C<o.length;C+=3){E.x=o[C+0],E.y=o[C+1],E.z=o[C+2];let S=m(E)/2/Math.PI+.5,b=p(E)/Math.PI+.5;s.push(S,1-b)}_(),h()}function h(){for(let E=0;E<s.length;E+=6){let C=s[E+0],S=s[E+2],b=s[E+4],T=Math.max(C,S,b),P=Math.min(C,S,b);T>.9&&P<.1&&(C<.2&&(s[E+0]+=1),S<.2&&(s[E+2]+=1),b<.2&&(s[E+4]+=1))}}function u(E){o.push(E.x,E.y,E.z)}function d(E,C){let S=E*3;C.x=e[S+0],C.y=e[S+1],C.z=e[S+2]}function _(){let E=new L,C=new L,S=new L,b=new L,T=new Ne,P=new Ne,x=new Ne;for(let A=0,D=0;A<o.length;A+=9,D+=6){E.set(o[A+0],o[A+1],o[A+2]),C.set(o[A+3],o[A+4],o[A+5]),S.set(o[A+6],o[A+7],o[A+8]),T.set(s[D+0],s[D+1]),P.set(s[D+2],s[D+3]),x.set(s[D+4],s[D+5]),b.copy(E).add(C).add(S).divideScalar(3);let G=m(b);v(T,D+0,E,G),v(P,D+2,C,G),v(x,D+4,S,G)}}function v(E,C,S,b){b<0&&E.x===1&&(s[C]=E.x-1),S.x===0&&S.z===0&&(s[C]=b/2/Math.PI+.5)}function m(E){return Math.atan2(E.z,-E.x)}function p(E){return Math.atan2(-E.y,Math.sqrt(E.x*E.x+E.z*E.z))}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new n(e.vertices,e.indices,e.radius,e.detail)}};var il=class{constructor(){this.type="Curve",this.arcLengthDivisions=200,this.needsUpdate=!1,this.cacheArcLengths=null}getPoint(){Re("Curve: .getPoint() not implemented.")}getPointAt(e,t){let i=this.getUtoTmapping(e);return this.getPoint(i,t)}getPoints(e=5){let t=[];for(let i=0;i<=e;i++)t.push(this.getPoint(i/e));return t}getSpacedPoints(e=5){let t=[];for(let i=0;i<=e;i++)t.push(this.getPointAt(i/e));return t}getLength(){let e=this.getLengths();return e[e.length-1]}getLengths(e=this.arcLengthDivisions){if(this.cacheArcLengths&&this.cacheArcLengths.length===e+1&&!this.needsUpdate)return this.cacheArcLengths;this.needsUpdate=!1;let t=[],i,r=this.getPoint(0),o=0;t.push(0);for(let s=1;s<=e;s++)i=this.getPoint(s/e),o+=i.distanceTo(r),t.push(o),r=i;return this.cacheArcLengths=t,t}updateArcLengths(){this.needsUpdate=!0,this.getLengths()}getUtoTmapping(e,t=null){let i=this.getLengths(),r=0,o=i.length,s;t?s=t:s=e*i[o-1];let a=0,c=o-1,l;for(;a<=c;)if(r=Math.floor(a+(c-a)/2),l=i[r]-s,l<0)a=r+1;else if(l>0)c=r-1;else{c=r;break}if(r=c,i[r]===s)return r/(o-1);let f=i[r],u=i[r+1]-f,d=(s-f)/u;return(r+d)/(o-1)}getTangent(e,t){let r=e-1e-4,o=e+1e-4;r<0&&(r=0),o>1&&(o=1);let s=this.getPoint(r),a=this.getPoint(o),c=t||(s.isVector2?new Ne:new L);return c.copy(a).sub(s).normalize(),c}getTangentAt(e,t){let i=this.getUtoTmapping(e);return this.getTangent(i,t)}computeFrenetFrames(e,t=!1){let i=new L,r=[],o=[],s=[],a=new L,c=new Ze;for(let d=0;d<=e;d++){let _=d/e;r[d]=this.getTangentAt(_,new L)}o[0]=new L,s[0]=new L;let l=Number.MAX_VALUE,f=Math.abs(r[0].x),h=Math.abs(r[0].y),u=Math.abs(r[0].z);f<=l&&(l=f,i.set(1,0,0)),h<=l&&(l=h,i.set(0,1,0)),u<=l&&i.set(0,0,1),a.crossVectors(r[0],i).normalize(),o[0].crossVectors(r[0],a),s[0].crossVectors(r[0],o[0]);for(let d=1;d<=e;d++){if(o[d]=o[d-1].clone(),s[d]=s[d-1].clone(),a.crossVectors(r[d-1],r[d]),a.length()>Number.EPSILON){a.normalize();let _=Math.acos(qe(r[d-1].dot(r[d]),-1,1));o[d].applyMatrix4(c.makeRotationAxis(a,_))}s[d].crossVectors(r[d],o[d])}if(t===!0){let d=Math.acos(qe(o[0].dot(o[e]),-1,1));d/=e,r[0].dot(a.crossVectors(o[0],o[e]))>0&&(d=-d);for(let _=1;_<=e;_++)o[_].applyMatrix4(c.makeRotationAxis(r[_],d*_)),s[_].crossVectors(r[_],o[_])}return{tangents:r,normals:o,binormals:s}}clone(){return new this.constructor().copy(this)}copy(e){return this.arcLengthDivisions=e.arcLengthDivisions,this}toJSON(){let e={metadata:{version:4.7,type:"Curve",generator:"Curve.toJSON"}};return e.arcLengthDivisions=this.arcLengthDivisions,e.type=this.type,e}fromJSON(e){return this.arcLengthDivisions=e.arcLengthDivisions,this}};function lc(){let n=0,e=0,t=0,i=0;function r(o,s,a,c){n=o,e=a,t=-3*o+3*s-2*a-c,i=2*o-2*s+a+c}return{initCatmullRom:function(o,s,a,c,l){r(s,a,l*(a-o),l*(c-s))},initNonuniformCatmullRom:function(o,s,a,c,l,f,h){let u=(s-o)/l-(a-o)/(l+f)+(a-s)/f,d=(a-s)/f-(c-s)/(f+h)+(c-a)/h;u*=f,d*=f,r(s,a,u,d)},calc:function(o){let s=o*o,a=s*o;return n+e*o+t*s+i*a}}}var Qf=new L,jf=new L,oc=new lc,sc=new lc,ac=new lc,Ro=class extends il{constructor(e=[],t=!1,i="centripetal",r=.5){super(),this.isCatmullRomCurve3=!0,this.type="CatmullRomCurve3",this.points=e,this.closed=t,this.curveType=i,this.tension=r}getPoint(e,t=new L){let i=t,r=this.points,o=r.length,s=(o-(this.closed?0:1))*e,a=Math.floor(s),c=s-a;this.closed?a+=a>0?0:(Math.floor(Math.abs(a)/o)+1)*o:c===0&&a===o-1&&(a=o-2,c=1);let l,f;this.closed||a>0?l=r[(a-1)%o]:(jf.subVectors(r[0],r[1]).add(r[0]),l=jf);let h=r[a%o],u=r[(a+1)%o];if(this.closed||a+2<o?f=r[(a+2)%o]:(Qf.subVectors(r[o-1],r[o-2]).add(r[o-1]),f=Qf),this.curveType==="centripetal"||this.curveType==="chordal"){let d=this.curveType==="chordal"?.5:.25,_=Math.pow(l.distanceToSquared(h),d),v=Math.pow(h.distanceToSquared(u),d),m=Math.pow(u.distanceToSquared(f),d);v<1e-4&&(v=1),_<1e-4&&(_=v),m<1e-4&&(m=v),oc.initNonuniformCatmullRom(l.x,h.x,u.x,f.x,_,v,m),sc.initNonuniformCatmullRom(l.y,h.y,u.y,f.y,_,v,m),ac.initNonuniformCatmullRom(l.z,h.z,u.z,f.z,_,v,m)}else this.curveType==="catmullrom"&&(oc.initCatmullRom(l.x,h.x,u.x,f.x,this.tension),sc.initCatmullRom(l.y,h.y,u.y,f.y,this.tension),ac.initCatmullRom(l.z,h.z,u.z,f.z,this.tension));return i.set(oc.calc(c),sc.calc(c),ac.calc(c)),i}copy(e){super.copy(e),this.points=[];for(let t=0,i=e.points.length;t<i;t++){let r=e.points[t];this.points.push(r.clone())}return this.closed=e.closed,this.curveType=e.curveType,this.tension=e.tension,this}toJSON(){let e=super.toJSON();e.points=[];for(let t=0,i=this.points.length;t<i;t++){let r=this.points[t];e.points.push(r.toArray())}return e.closed=this.closed,e.curveType=this.curveType,e.tension=this.tension,e}fromJSON(e){super.fromJSON(e),this.points=[];for(let t=0,i=e.points.length;t<i;t++){let r=e.points[t];this.points.push(new L().fromArray(r))}return this.closed=e.closed,this.curveType=e.curveType,this.tension=e.tension,this}};var nl=class n extends tl{constructor(e=1,t=0){let i=(1+Math.sqrt(5))/2,r=[-1,i,0,1,i,0,-1,-i,0,1,-i,0,0,-1,i,0,1,i,0,-1,-i,0,1,-i,i,0,-1,i,0,1,-i,0,-1,-i,0,1],o=[0,11,5,0,5,1,0,1,7,0,7,10,0,10,11,1,5,9,5,11,4,11,10,2,10,7,6,7,1,8,3,9,4,3,4,2,3,2,6,3,6,8,3,8,9,4,9,5,2,4,11,6,2,10,8,6,7,9,8,1];super(r,o,e,t),this.type="IcosahedronGeometry",this.parameters={radius:e,detail:t}}static fromJSON(e){return new n(e.radius,e.detail)}};var ni=class n extends Ct{constructor(e=1,t=1,i=1,r=1){super(),this.type="PlaneGeometry",this.parameters={width:e,height:t,widthSegments:i,heightSegments:r};let o=e/2,s=t/2,a=Math.floor(i),c=Math.floor(r),l=a+1,f=c+1,h=e/a,u=t/c,d=[],_=[],v=[],m=[];for(let p=0;p<f;p++){let E=p*u-s;for(let C=0;C<l;C++){let S=C*h-o;_.push(S,-E,0),v.push(0,0,1),m.push(C/a),m.push(1-p/c)}}for(let p=0;p<c;p++)for(let E=0;E<a;E++){let C=E+l*p,S=E+l*(p+1),b=E+1+l*(p+1),T=E+1+l*p;d.push(C,S,T),d.push(S,b,T)}this.setIndex(d),this.setAttribute("position",new gt(_,3)),this.setAttribute("normal",new gt(v,3)),this.setAttribute("uv",new gt(m,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new n(e.width,e.height,e.widthSegments,e.heightSegments)}};var Vs=class extends ii{constructor(e){super(),this.isShadowMaterial=!0,this.type="ShadowMaterial",this.color=new Ee(0),this.transparent=!0,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.fog=e.fog,this}};function Bn(n){let e={};for(let t in n){e[t]={};for(let i in n[t]){let r=n[t][i];if(eu(r))r.isRenderTargetTexture?(Re("UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms()."),e[t][i]=null):e[t][i]=r.clone();else if(Array.isArray(r))if(eu(r[0])){let o=[];for(let s=0,a=r.length;s<a;s++)o[s]=r[s].clone();e[t][i]=o}else e[t][i]=r.slice();else e[t][i]=r}}return e}function Si(n){let e={};for(let t=0;t<n.length;t++){let i=Bn(n[t]);for(let r in i)e[r]=i[r]}return e}function eu(n){return n&&(n.isColor||n.isMatrix3||n.isMatrix4||n.isVector2||n.isVector3||n.isVector4||n.isTexture||n.isQuaternion)}function tu(n){let e=[];for(let t=0;t<n.length;t++)e.push(n[t].clone());return e}function rl(n){let e=n.getRenderTarget();return e===null?n.outputColorSpace:e.isXRRenderTarget===!0?e.texture.colorSpace:Ye.workingColorSpace}var iu={clone:Bn,merge:Si};var nu=`void main() {
gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;var ru=`void main() {
gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}
`;var yi=class extends ii{constructor(e){super(),this.isShaderMaterial=!0,this.type="ShaderMaterial",this.defines={},this.uniforms={},this.uniformsGroups=[],this.vertexShader=nu,this.fragmentShader=ru,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.forceSinglePass=!0,this.extensions={clipCullDistance:!1,multiDraw:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv1:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,e!==void 0&&this.setValues(e)}copy(e){return super.copy(e),this.fragmentShader=e.fragmentShader,this.vertexShader=e.vertexShader,this.uniforms=Bn(e.uniforms),this.uniformsGroups=tu(e.uniformsGroups),this.defines=Object.assign({},e.defines),this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.fog=e.fog,this.lights=e.lights,this.clipping=e.clipping,this.extensions=Object.assign({},e.extensions),this.glslVersion=e.glslVersion,this.defaultAttributeValues=Object.assign({},e.defaultAttributeValues),this.index0AttributeName=e.index0AttributeName,this.uniformsNeedUpdate=e.uniformsNeedUpdate,this}toJSON(e){let t=super.toJSON(e);t.glslVersion=this.glslVersion,t.uniforms={};for(let r in this.uniforms){let s=this.uniforms[r].value;s&&s.isTexture?t.uniforms[r]={type:"t",value:s.toJSON(e).uuid}:s&&s.isColor?t.uniforms[r]={type:"c",value:s.getHex()}:s&&s.isVector2?t.uniforms[r]={type:"v2",value:s.toArray()}:s&&s.isVector3?t.uniforms[r]={type:"v3",value:s.toArray()}:s&&s.isVector4?t.uniforms[r]={type:"v4",value:s.toArray()}:s&&s.isMatrix3?t.uniforms[r]={type:"m3",value:s.toArray()}:s&&s.isMatrix4?t.uniforms[r]={type:"m4",value:s.toArray()}:t.uniforms[r]={value:s}}Object.keys(this.defines).length>0&&(t.defines=this.defines),t.vertexShader=this.vertexShader,t.fragmentShader=this.fragmentShader,t.lights=this.lights,t.clipping=this.clipping;let i={};for(let r in this.extensions)this.extensions[r]===!0&&(i[r]=!0);return Object.keys(i).length>0&&(t.extensions=i),t}fromJSON(e,t){if(super.fromJSON(e,t),e.uniforms!==void 0)for(let i in e.uniforms){let r=e.uniforms[i];switch(this.uniforms[i]={},r.type){case"t":this.uniforms[i].value=t[r.value]||null;break;case"c":this.uniforms[i].value=new Ee().setHex(r.value);break;case"v2":this.uniforms[i].value=new Ne().fromArray(r.value);break;case"v3":this.uniforms[i].value=new L().fromArray(r.value);break;case"v4":this.uniforms[i].value=new At().fromArray(r.value);break;case"m3":this.uniforms[i].value=new Be().fromArray(r.value);break;case"m4":this.uniforms[i].value=new Ze().fromArray(r.value);break;default:this.uniforms[i].value=r.value}}if(e.defines!==void 0&&(this.defines=e.defines),e.vertexShader!==void 0&&(this.vertexShader=e.vertexShader),e.fragmentShader!==void 0&&(this.fragmentShader=e.fragmentShader),e.glslVersion!==void 0&&(this.glslVersion=e.glslVersion),e.extensions!==void 0)for(let i in e.extensions)this.extensions[i]=e.extensions[i];return e.lights!==void 0&&(this.lights=e.lights),e.clipping!==void 0&&(this.clipping=e.clipping),this}};var ol=class extends yi{constructor(e){super(e),this.isRawShaderMaterial=!0,this.type="RawShaderMaterial"}};var Sn=class extends ii{constructor(e){super(),this.isMeshStandardMaterial=!0,this.type="MeshStandardMaterial",this.defines={STANDARD:""},this.color=new Ee(16777215),this.roughness=1,this.metalness=0,this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new Ee(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=yr,this.normalScale=new Ne(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.roughnessMap=null,this.metalnessMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new Ui,this.envMapIntensity=1,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.flatShading=!1,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.defines={STANDARD:""},this.color.copy(e.color),this.roughness=e.roughness,this.metalness=e.metalness,this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.emissive.copy(e.emissive),this.emissiveMap=e.emissiveMap,this.emissiveIntensity=e.emissiveIntensity,this.bumpMap=e.bumpMap,this.bumpScale=e.bumpScale,this.normalMap=e.normalMap,this.normalMapType=e.normalMapType,this.normalScale.copy(e.normalScale),this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.roughnessMap=e.roughnessMap,this.metalnessMap=e.metalnessMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.envMapIntensity=e.envMapIntensity,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.flatShading=e.flatShading,this.fog=e.fog,this}};var Hs=class extends ii{constructor(e){super(),this.isMeshLambertMaterial=!0,this.type="MeshLambertMaterial",this.color=new Ee(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new Ee(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=yr,this.normalScale=new Ne(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new Ui,this.combine=kr,this.reflectivity=1,this.envMapIntensity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.flatShading=!1,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.emissive.copy(e.emissive),this.emissiveMap=e.emissiveMap,this.emissiveIntensity=e.emissiveIntensity,this.bumpMap=e.bumpMap,this.bumpScale=e.bumpScale,this.normalMap=e.normalMap,this.normalMapType=e.normalMapType,this.normalScale.copy(e.normalScale),this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.specularMap=e.specularMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.combine=e.combine,this.reflectivity=e.reflectivity,this.envMapIntensity=e.envMapIntensity,this.refractionRatio=e.refractionRatio,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.flatShading=e.flatShading,this.fog=e.fog,this}};var Dr=class extends ii{constructor(e){super(),this.isMeshDepthMaterial=!0,this.type="MeshDepthMaterial",this.depthPacking=pf,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.setValues(e)}copy(e){return super.copy(e),this.depthPacking=e.depthPacking,this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this}};var sl=class extends ii{constructor(e){super(),this.isMeshDistanceMaterial=!0,this.type="MeshDistanceMaterial",this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.setValues(e)}copy(e){return super.copy(e),this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this}};var yn=class extends dt{constructor(e,t=1){super(),this.isLight=!0,this.type="Light",this.color=new Ee(e),this.intensity=t}copy(e,t){return super.copy(e,t),this.color.copy(e.color),this.intensity=e.intensity,this}toJSON(e){let t=super.toJSON(e);return t.object.color=this.color.getHex(),t.object.intensity=this.intensity,t}};var ks=class extends yn{constructor(e,t,i){super(e,i),this.isHemisphereLight=!0,this.type="HemisphereLight",this.position.copy(dt.DEFAULT_UP),this.updateMatrix(),this.groundColor=new Ee(t)}copy(e,t){return super.copy(e,t),this.groundColor.copy(e.groundColor),this}toJSON(e){let t=super.toJSON(e);return t.object.groundColor=this.groundColor.getHex(),t}};var cc=new Ze,ou=new L,su=new L,or=class{constructor(e){this.camera=e,this.intensity=1,this.bias=0,this.biasNode=null,this.normalBias=0,this.radius=1,this.blurSamples=8,this.mapSize=new Ne(512,512),this.mapType=Qt,this.map=null,this.mapPass=null,this.matrix=new Ze,this.autoUpdate=!0,this.needsUpdate=!1,this._frustum=new rr,this._frameExtents=new Ne(1,1),this._viewportCount=1,this._viewports=[new At(0,0,1,1)]}getViewportCount(){return this._viewportCount}getCamera(){return this.camera}getFrustum(){return this._frustum}updateMatrices(e){let t=this.camera;ou.setFromMatrixPosition(e.matrixWorld),t.position.copy(ou),su.setFromMatrixPosition(e.target.matrixWorld),t.lookAt(su),t.updateMatrixWorld(),this._updateMatrix(t,this.matrix,this._frustum)}_updateMatrix(e,t,i,r){cc.multiplyMatrices(e.projectionMatrix,e.matrixWorldInverse),i.setFromProjectionMatrix(cc,e.coordinateSystem,e.reversedDepth);let o=this._frameExtents,s=r?r.z/o.x:1,a=r?r.w/o.y:1,c=r?r.x/o.x:0,l=r?r.y/o.y:0;e.coordinateSystem===Ln||e.reversedDepth?t.set(.5*s,0,0,.5*s+c,0,.5*a,0,.5*a+l,0,0,1,0,0,0,0,1):t.set(.5*s,0,0,.5*s+c,0,.5*a,0,.5*a+l,0,0,.5,.5,0,0,0,1),t.multiply(cc)}getViewport(e){return this._viewports[e]}getFrameExtents(){return this._frameExtents}dispose(){this.map&&this.map.dispose(),this.mapPass&&this.mapPass.dispose()}copy(e){return this.camera=e.camera.clone(),this.intensity=e.intensity,this.bias=e.bias,this.radius=e.radius,this.autoUpdate=e.autoUpdate,this.needsUpdate=e.needsUpdate,this.normalBias=e.normalBias,this.blurSamples=e.blurSamples,this.mapSize.copy(e.mapSize),this.biasNode=e.biasNode,this}clone(){return new this.constructor().copy(this)}toJSON(){let e={};return e.intensity=this.intensity,e.bias=this.bias,e.normalBias=this.normalBias,e.radius=this.radius,e.blurSamples=this.blurSamples,e.mapSize=this.mapSize.toArray(),e.camera=this.camera.toJSON(!1).object,delete e.camera.matrix,e}};var al=new L,ll=new Zi,En=new L,Co=class extends dt{constructor(){super(),this.isCamera=!0,this.type="Camera",this.matrixWorldInverse=new Ze,this.projectionMatrix=new Ze,this.projectionMatrixInverse=new Ze,this.coordinateSystem=Pi,this._reversedDepth=!1}get reversedDepth(){return this._reversedDepth}copy(e,t){return super.copy(e,t),this.matrixWorldInverse.copy(e.matrixWorldInverse),this.projectionMatrix.copy(e.projectionMatrix),this.projectionMatrixInverse.copy(e.projectionMatrixInverse),this.coordinateSystem=e.coordinateSystem,this}getWorldDirection(e){return super.getWorldDirection(e).negate()}updateMatrixWorld(e){super.updateMatrixWorld(e),this.matrixWorld.decompose(al,ll,En),En.x===1&&En.y===1&&En.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(al,ll,En.set(1,1,1)).invert()}updateWorldMatrix(e,t,i=!1){super.updateWorldMatrix(e,t,i),this.matrixWorld.decompose(al,ll,En),En.x===1&&En.y===1&&En.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(al,ll,En.set(1,1,1)).invert()}clone(){return new this.constructor().copy(this)}};var sr=new L,au=new Ne,lu=new Ne,ri=class extends Co{constructor(e=50,t=1,i=.1,r=2e3){super(),this.isPerspectiveCamera=!0,this.type="PerspectiveCamera",this.fov=e,this.zoom=1,this.near=i,this.far=r,this.focus=10,this.aspect=t,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.fov=e.fov,this.zoom=e.zoom,this.near=e.near,this.far=e.far,this.focus=e.focus,this.aspect=e.aspect,this.view=e.view===null?null:Object.assign({},e.view),this.filmGauge=e.filmGauge,this.filmOffset=e.filmOffset,this}setFocalLength(e){let t=.5*this.getFilmHeight()/e;this.fov=Ls*2*Math.atan(t),this.updateProjectionMatrix()}getFocalLength(){let e=Math.tan(ba*.5*this.fov);return .5*this.getFilmHeight()/e}getEffectiveFOV(){return Ls*2*Math.atan(Math.tan(ba*.5*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}getViewBounds(e,t,i){sr.set(-1,-1,.5).applyMatrix4(this.projectionMatrixInverse),t.set(sr.x,sr.y).multiplyScalar(-e/sr.z),sr.set(1,1,.5).applyMatrix4(this.projectionMatrixInverse),i.set(sr.x,sr.y).multiplyScalar(-e/sr.z)}getViewSize(e,t){return this.getViewBounds(e,au,lu),t.subVectors(lu,au)}setViewOffset(e,t,i,r,o,s){this.aspect=e/t,this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=i,this.view.offsetY=r,this.view.width=o,this.view.height=s,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let e=this.near,t=e*Math.tan(ba*.5*this.fov)/this.zoom,i=2*t,r=this.aspect*i,o=-.5*r,s=this.view;if(this.view!==null&&this.view.enabled){let c=s.fullWidth,l=s.fullHeight;o+=s.offsetX*r/c,t-=s.offsetY*i/l,r*=s.width/c,i*=s.height/l}let a=this.filmOffset;a!==0&&(o+=e*a/this.getFilmWidth()),this.projectionMatrix.makePerspective(o,o+r,t,t-i,e,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){let t=super.toJSON(e);return t.object.fov=this.fov,t.object.zoom=this.zoom,t.object.near=this.near,t.object.far=this.far,t.object.focus=this.focus,t.object.aspect=this.aspect,this.view!==null&&(t.object.view=Object.assign({},this.view)),t.object.filmGauge=this.filmGauge,t.object.filmOffset=this.filmOffset,t}};var cl=class extends or{constructor(){super(new ri(50,1,.5,500)),this.isSpotLightShadow=!0,this.focus=1,this.aspect=1}updateMatrices(e){let t=this.camera,i=Ls*2*e.angle*this.focus,r=this.mapSize.width/this.mapSize.height*this.aspect,o=e.distance||t.far;(i!==t.fov||r!==t.aspect||o!==t.far)&&(t.fov=i,t.aspect=r,t.far=o,t.updateProjectionMatrix()),super.updateMatrices(e)}copy(e){return super.copy(e),this.focus=e.focus,this.aspect=e.aspect,this}toJSON(){let e=super.toJSON();return e.focus=this.focus,e.aspect=this.aspect,e}};var Ws=class extends yn{constructor(e,t,i=0,r=Math.PI/3,o=0,s=2){super(e,t),this.isSpotLight=!0,this.type="SpotLight",this.position.copy(dt.DEFAULT_UP),this.updateMatrix(),this.target=new dt,this.distance=i,this.angle=r,this.penumbra=o,this.decay=s,this.map=null,this.shadow=new cl}get power(){return this.intensity*Math.PI}set power(e){this.intensity=e/Math.PI}dispose(){super.dispose(),this.shadow.dispose()}copy(e,t){return super.copy(e,t),this.distance=e.distance,this.angle=e.angle,this.penumbra=e.penumbra,this.decay=e.decay,this.target=e.target.clone(),this.map=e.map,this.shadow=e.shadow.clone(),this}toJSON(e){let t=super.toJSON(e);return t.object.distance=this.distance,t.object.angle=this.angle,t.object.decay=this.decay,t.object.penumbra=this.penumbra,t.object.target=this.target.uuid,this.map&&this.map.isTexture&&(t.object.map=this.map.toJSON(e).uuid),t.object.shadow=this.shadow.toJSON(),t}};var fl=class extends or{constructor(){super(new ri(90,1,.5,500)),this.isPointLightShadow=!0}};var Xs=class extends yn{constructor(e,t,i=0,r=2){super(e,t),this.isPointLight=!0,this.type="PointLight",this.distance=i,this.decay=r,this.shadow=new fl}get power(){return this.intensity*4*Math.PI}set power(e){this.intensity=e/(4*Math.PI)}dispose(){super.dispose(),this.shadow.dispose()}copy(e,t){return super.copy(e,t),this.distance=e.distance,this.decay=e.decay,this.shadow=e.shadow.clone(),this}toJSON(e){let t=super.toJSON(e);return t.object.distance=this.distance,t.object.decay=this.decay,t.object.shadow=this.shadow.toJSON(),t}};var ar=class extends Co{constructor(e=-1,t=1,i=1,r=-1,o=.1,s=2e3){super(),this.isOrthographicCamera=!0,this.type="OrthographicCamera",this.zoom=1,this.view=null,this.left=e,this.right=t,this.top=i,this.bottom=r,this.near=o,this.far=s,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.left=e.left,this.right=e.right,this.top=e.top,this.bottom=e.bottom,this.near=e.near,this.far=e.far,this.zoom=e.zoom,this.view=e.view===null?null:Object.assign({},e.view),this}setViewOffset(e,t,i,r,o,s){this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=i,this.view.offsetY=r,this.view.width=o,this.view.height=s,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let e=(this.right-this.left)/(2*this.zoom),t=(this.top-this.bottom)/(2*this.zoom),i=(this.right+this.left)/2,r=(this.top+this.bottom)/2,o=i-e,s=i+e,a=r+t,c=r-t;if(this.view!==null&&this.view.enabled){let l=(this.right-this.left)/this.view.fullWidth/this.zoom,f=(this.top-this.bottom)/this.view.fullHeight/this.zoom;o+=l*this.view.offsetX,s=o+l*this.view.width,a-=f*this.view.offsetY,c=a-f*this.view.height}this.projectionMatrix.makeOrthographic(o,s,a,c,this.near,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){let t=super.toJSON(e);return t.object.zoom=this.zoom,t.object.left=this.left,t.object.right=this.right,t.object.top=this.top,t.object.bottom=this.bottom,t.object.near=this.near,t.object.far=this.far,this.view!==null&&(t.object.view=Object.assign({},this.view)),t}};var ul=class extends or{constructor(){super(new ar(-5,5,5,-5,.5,500)),this.isDirectionalLightShadow=!0}};var qs=class extends yn{constructor(e,t){super(e,t),this.isDirectionalLight=!0,this.type="DirectionalLight",this.position.copy(dt.DEFAULT_UP),this.updateMatrix(),this.target=new dt,this.shadow=new ul}dispose(){super.dispose(),this.shadow.dispose()}copy(e){return super.copy(e),this.target=e.target.clone(),this.shadow=e.shadow.clone(),this}toJSON(e){let t=super.toJSON(e);return t.object.shadow=this.shadow.toJSON(),t.object.target=this.target.uuid,t}};var Po=-90,Lo=1,hl=class extends dt{constructor(e,t,i){super(),this.type="CubeCamera",this.renderTarget=i,this.coordinateSystem=null,this.activeMipmapLevel=0;let r=new ri(Po,Lo,e,t);r.layers=this.layers,this.add(r);let o=new ri(Po,Lo,e,t);o.layers=this.layers,this.add(o);let s=new ri(Po,Lo,e,t);s.layers=this.layers,this.add(s);let a=new ri(Po,Lo,e,t);a.layers=this.layers,this.add(a);let c=new ri(Po,Lo,e,t);c.layers=this.layers,this.add(c);let l=new ri(Po,Lo,e,t);l.layers=this.layers,this.add(l)}updateCoordinateSystem(){let e=this.coordinateSystem,t=this.children.concat(),[i,r,o,s,a,c]=t;for(let l of t)this.remove(l);if(e===Pi)i.up.set(0,1,0),i.lookAt(1,0,0),r.up.set(0,1,0),r.lookAt(-1,0,0),o.up.set(0,0,-1),o.lookAt(0,1,0),s.up.set(0,0,1),s.lookAt(0,-1,0),a.up.set(0,1,0),a.lookAt(0,0,1),c.up.set(0,1,0),c.lookAt(0,0,-1);else if(e===Ln)i.up.set(0,-1,0),i.lookAt(-1,0,0),r.up.set(0,-1,0),r.lookAt(1,0,0),o.up.set(0,0,1),o.lookAt(0,1,0),s.up.set(0,0,-1),s.lookAt(0,-1,0),a.up.set(0,-1,0),a.lookAt(0,0,1),c.up.set(0,-1,0),c.lookAt(0,0,-1);else throw new Error("THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: "+e);for(let l of t)this.add(l),l.updateMatrixWorld()}update(e,t){this.parent===null&&this.updateMatrixWorld();let{renderTarget:i,activeMipmapLevel:r}=this;this.coordinateSystem!==e.coordinateSystem&&(this.coordinateSystem=e.coordinateSystem,this.updateCoordinateSystem());let[o,s,a,c,l,f]=this.children,h=e.getRenderTarget(),u=e.getActiveCubeFace(),d=e.getActiveMipmapLevel(),_=e.xr.enabled;e.xr.enabled=!1;let v=i.texture.generateMipmaps;i.texture.generateMipmaps=!1;let m=!1;e.isWebGLRenderer===!0?m=e.state.buffers.depth.getReversed():m=e.reversedDepthBuffer,e.setRenderTarget(i,0,r),m&&e.autoClear===!1&&e.clearDepth(),e.render(t,o),e.setRenderTarget(i,1,r),m&&e.autoClear===!1&&e.clearDepth(),e.render(t,s),e.setRenderTarget(i,2,r),m&&e.autoClear===!1&&e.clearDepth(),e.render(t,a),e.setRenderTarget(i,3,r),m&&e.autoClear===!1&&e.clearDepth(),e.render(t,c),e.setRenderTarget(i,4,r),m&&e.autoClear===!1&&e.clearDepth(),e.render(t,l),i.texture.generateMipmaps=v,e.setRenderTarget(i,5,r),m&&e.autoClear===!1&&e.clearDepth(),e.render(t,f),e.setRenderTarget(h,u,d),e.xr.enabled=_,i.texture.needsPMREMUpdate=!0}};function fc(n,e,t,i){let r=Km(i);switch(t){case Sa:return n*e;case Zr:return n*e/r.components*r.byteLength;case Kr:return n*e/r.components*r.byteLength;case zi:return n*e*2/r.components*r.byteLength;case Jr:return n*e*2/r.components*r.byteLength;case ya:return n*e*3/r.components*r.byteLength;case Ci:return n*e*4/r.components*r.byteLength;case $r:return n*e*4/r.components*r.byteLength;case Qr:case jr:return Math.floor((n+3)/4)*Math.floor((e+3)/4)*8;case eo:case to:return Math.floor((n+3)/4)*Math.floor((e+3)/4)*16;case is:case rs:return Math.max(n,16)*Math.max(e,8)/4;case ts:case ns:return Math.max(n,8)*Math.max(e,8)/2;case os:case ss:case ls:case cs:return Math.floor((n+3)/4)*Math.floor((e+3)/4)*8;case as:case vr:case fs:return Math.floor((n+3)/4)*Math.floor((e+3)/4)*16;case us:return Math.floor((n+3)/4)*Math.floor((e+3)/4)*16;case hs:return Math.floor((n+4)/5)*Math.floor((e+3)/4)*16;case ds:return Math.floor((n+4)/5)*Math.floor((e+4)/5)*16;case ps:return Math.floor((n+5)/6)*Math.floor((e+4)/5)*16;case ms:return Math.floor((n+5)/6)*Math.floor((e+5)/6)*16;case gs:return Math.floor((n+7)/8)*Math.floor((e+4)/5)*16;case _s:return Math.floor((n+7)/8)*Math.floor((e+5)/6)*16;case xs:return Math.floor((n+7)/8)*Math.floor((e+7)/8)*16;case Ms:return Math.floor((n+9)/10)*Math.floor((e+4)/5)*16;case vs:return Math.floor((n+9)/10)*Math.floor((e+5)/6)*16;case Ss:return Math.floor((n+9)/10)*Math.floor((e+7)/8)*16;case ys:return Math.floor((n+9)/10)*Math.floor((e+9)/10)*16;case Es:return Math.floor((n+11)/12)*Math.floor((e+9)/10)*16;case bs:return Math.floor((n+11)/12)*Math.floor((e+11)/12)*16;case Ts:case As:case ws:return Math.ceil(n/4)*Math.ceil(e/4)*16;case Rs:case Cs:return Math.ceil(n/4)*Math.ceil(e/4)*8;case Sr:case Ps:return Math.ceil(n/4)*Math.ceil(e/4)*16}throw new Error(`Unable to determine texture byte length for ${t} format.`)}function Km(n){switch(n){case Qt:case _a:return{byteLength:1,components:1};case Cn:case xa:case jt:return{byteLength:2,components:1};case qr:case Yr:return{byteLength:2,components:4};case pi:case Xr:case Kt:return{byteLength:4,components:1};case Ma:case va:return{byteLength:4,components:3}}throw new Error(`THREE.TextureUtils: Unknown texture type ${n}.`)}typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register",{detail:{revision:Wo}}));typeof window<"u"&&(window.__THREE__?Re("WARNING: Multiple instances of Three.js being imported."):window.__THREE__=Wo);function cu(){let n=null,e=!1,t=null,i=null;function r(o,s){i=n.requestAnimationFrame(r),t(o,s)}return{start:function(){e!==!0&&t!==null&&n!==null&&(i=n.requestAnimationFrame(r),e=!0)},stop:function(){n!==null&&n.cancelAnimationFrame(i),e=!1},setAnimationLoop:function(o){t=o},setContext:function(o){n=o}}}function fu(n){let e=new WeakMap;function t(a,c){let l=a.array,f=a.usage,h=l.byteLength,u=n.createBuffer();n.bindBuffer(c,u),n.bufferData(c,l,f),a.onUploadCallback();let d;if(l instanceof Float32Array)d=n.FLOAT;else if(typeof Float16Array<"u"&&l instanceof Float16Array)d=n.HALF_FLOAT;else if(l instanceof Uint16Array)a.isFloat16BufferAttribute?d=n.HALF_FLOAT:d=n.UNSIGNED_SHORT;else if(l instanceof Int16Array)d=n.SHORT;else if(l instanceof Uint32Array)d=n.UNSIGNED_INT;else if(l instanceof Int32Array)d=n.INT;else if(l instanceof Int8Array)d=n.BYTE;else if(l instanceof Uint8Array)d=n.UNSIGNED_BYTE;else if(l instanceof Uint8ClampedArray)d=n.UNSIGNED_BYTE;else throw new Error("THREE.WebGLAttributes: Unsupported buffer data format: "+l);return{buffer:u,type:d,bytesPerElement:l.BYTES_PER_ELEMENT,version:a.version,size:h}}function i(a,c,l){let f=c.array,h=c.updateRanges;if(n.bindBuffer(l,a),h.length===0)n.bufferSubData(l,0,f);else{h.sort((d,_)=>d.start-_.start);let u=0;for(let d=1;d<h.length;d++){let _=h[u],v=h[d];v.start<=_.start+_.count+1?_.count=Math.max(_.count,v.start+v.count-_.start):(++u,h[u]=v)}h.length=u+1;for(let d=0,_=h.length;d<_;d++){let v=h[d];n.bufferSubData(l,v.start*f.BYTES_PER_ELEMENT,f,v.start,v.count)}c.clearUpdateRanges()}c.onUploadCallback()}function r(a){return a.isInterleavedBufferAttribute&&(a=a.data),e.get(a)}function o(a){a.isInterleavedBufferAttribute&&(a=a.data);let c=e.get(a);c&&(n.deleteBuffer(c.buffer),e.delete(a))}function s(a,c){if(a.isInterleavedBufferAttribute&&(a=a.data),a.isGLBufferAttribute){let f=e.get(a);(!f||f.version<a.version)&&e.set(a,{buffer:a.buffer,type:a.type,bytesPerElement:a.elementSize,version:a.version});return}let l=e.get(a);if(l===void 0)e.set(a,t(a,c));else if(l.version<a.version){if(l.size!==a.array.byteLength)throw new Error("THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.");i(l.buffer,a,c),l.version=a.version}}return{get:r,remove:o,update:s}}var uu=`#ifdef USE_ALPHAHASH
if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif
`;var hu=`#ifdef USE_ALPHAHASH
const float ALPHA_HASH_SCALE = 0.05;
float hash2D( vec2 value ) {
return fract( 1.0e4 * sin( 17.0 * value.x + 0.1 * value.y ) * ( 0.1 + abs( sin( 13.0 * value.y + value.x ) ) ) );
}
float hash3D( vec3 value ) {
return hash2D( vec2( hash2D( value.xy ), value.z ) );
}
float getAlphaHashThreshold( vec3 position ) {
float maxDeriv = max(
length( dFdx( position.xyz ) ),
length( dFdy( position.xyz ) )
);
float pixScale = 1.0 / ( ALPHA_HASH_SCALE * maxDeriv );
vec2 pixScales = vec2(
exp2( floor( log2( pixScale ) ) ),
exp2( ceil( log2( pixScale ) ) )
);
vec2 alpha = vec2(
hash3D( floor( pixScales.x * position.xyz ) ),
hash3D( floor( pixScales.y * position.xyz ) )
);
float lerpFactor = fract( log2( pixScale ) );
float x = ( 1.0 - lerpFactor ) * alpha.x + lerpFactor * alpha.y;
float a = min( lerpFactor, 1.0 - lerpFactor );
vec3 cases = vec3(
x * x / ( 2.0 * a * ( 1.0 - a ) ),
( x - 0.5 * a ) / ( 1.0 - a ),
1.0 - ( ( 1.0 - x ) * ( 1.0 - x ) / ( 2.0 * a * ( 1.0 - a ) ) )
);
float threshold = ( x < ( 1.0 - a ) )
? ( ( x < a ) ? cases.x : cases.y )
: cases.z;
return clamp( threshold , 1.0e-6, 1.0 );
}
#endif
`;var du=`#ifdef USE_ALPHAMAP
diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif
`;var pu=`#ifdef USE_ALPHAMAP
uniform sampler2D alphaMap;
#endif
`;var mu=`#ifdef USE_ALPHATEST
#ifdef ALPHA_TO_COVERAGE
diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
if ( diffuseColor.a == 0.0 ) discard;
#else
if ( diffuseColor.a < alphaTest ) discard;
#endif
#endif
`;var gu=`#ifdef USE_ALPHATEST
uniform float alphaTest;
#endif
`;var _u=`#ifdef USE_AOMAP
float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
reflectedLight.indirectDiffuse *= ambientOcclusion;
#if defined( USE_CLEARCOAT )
clearcoatSpecularIndirect *= ambientOcclusion;
#endif
#if defined( USE_SHEEN )
sheenSpecularIndirect *= ambientOcclusion;
#endif
#if defined( USE_ENVMAP ) && defined( STANDARD )
float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
#endif
#endif
`;var xu=`#ifdef USE_AOMAP
uniform sampler2D aoMap;
uniform float aoMapIntensity;
#endif
`;var Mu=`#ifdef USE_BATCHING
#if ! defined( GL_ANGLE_multi_draw )
#define gl_DrawID _gl_DrawID
uniform int _gl_DrawID;
#endif
uniform highp sampler2D batchingTexture;
uniform highp usampler2D batchingIdTexture;
mat4 getBatchingMatrix( const in float i ) {
int size = textureSize( batchingTexture, 0 ).x;
int j = int( i ) * 4;
int x = j % size;
int y = j / size;
vec4 v1 = texelFetch( batchingTexture, ivec2( x, y ), 0 );
vec4 v2 = texelFetch( batchingTexture, ivec2( x + 1, y ), 0 );
vec4 v3 = texelFetch( batchingTexture, ivec2( x + 2, y ), 0 );
vec4 v4 = texelFetch( batchingTexture, ivec2( x + 3, y ), 0 );
return mat4( v1, v2, v3, v4 );
}
float getIndirectIndex( const in int i ) {
int size = textureSize( batchingIdTexture, 0 ).x;
int x = i % size;
int y = i / size;
return float( texelFetch( batchingIdTexture, ivec2( x, y ), 0 ).r );
}
#endif
#ifdef USE_BATCHING_COLOR
uniform sampler2D batchingColorTexture;
vec4 getBatchingColor( const in float i ) {
int size = textureSize( batchingColorTexture, 0 ).x;
int j = int( i );
int x = j % size;
int y = j / size;
return texelFetch( batchingColorTexture, ivec2( x, y ), 0 );
}
#endif
`;var vu=`#ifdef USE_BATCHING
mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif
`;var Su=`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
vPosition = vec3( position );
#endif
`;var yu=`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
vec3 objectTangent = vec3( tangent.xyz );
#endif
`;var Eu=`float G_BlinnPhong_Implicit( ) {
return 0.25;
}
float D_BlinnPhong( const in float shininess, const in float dotNH ) {
return RECIPROCAL_PI * ( shininess * 0.5 + 1.0 ) * pow( dotNH, shininess );
}
vec3 BRDF_BlinnPhong( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float shininess ) {
vec3 halfDir = normalize( lightDir + viewDir );
float dotNH = saturate( dot( normal, halfDir ) );
float dotVH = saturate( dot( viewDir, halfDir ) );
vec3 F = F_Schlick( specularColor, 1.0, dotVH );
float G = G_BlinnPhong_Implicit( );
float D = D_BlinnPhong( shininess, dotNH );
return F * ( G * D );
}
`;var bu=`#ifdef USE_IRIDESCENCE
const mat3 XYZ_TO_REC709 = mat3(
3.2404542, -0.9692660, 0.0556434,
-1.5371385, 1.8760108, -0.2040259,
-0.4985314, 0.0415560, 1.0572252
);
vec3 Fresnel0ToIor( vec3 fresnel0 ) {
vec3 sqrtF0 = sqrt( fresnel0 );
return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 );
}
vec3 IorToFresnel0( vec3 transmittedIor, float incidentIor ) {
return pow2( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) );
}
float IorToFresnel0( float transmittedIor, float incidentIor ) {
return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ));
}
vec3 evalSensitivity( float OPD, vec3 shift ) {
float phase = 2.0 * PI * OPD * 1.0e-9;
vec3 val = vec3( 5.4856e-13, 4.4201e-13, 5.2481e-13 );
vec3 pos = vec3( 1.6810e+06, 1.7953e+06, 2.2084e+06 );
vec3 var = vec3( 4.3278e+09, 9.3046e+09, 6.6121e+09 );
vec3 xyz = val * sqrt( 2.0 * PI * var ) * cos( pos * phase + shift ) * exp( - pow2( phase ) * var );
xyz.x += 9.7470e-14 * sqrt( 2.0 * PI * 4.5282e+09 ) * cos( 2.2399e+06 * phase + shift[ 0 ] ) * exp( - 4.5282e+09 * pow2( phase ) );
xyz /= 1.0685e-7;
vec3 rgb = XYZ_TO_REC709 * xyz;
return rgb;
}
vec3 evalIridescence( float outsideIOR, float eta2, float cosTheta1, float thinFilmThickness, vec3 baseF0 ) {
vec3 I;
float iridescenceIOR = mix( outsideIOR, eta2, smoothstep( 0.0, 0.03, thinFilmThickness ) );
float sinTheta2Sq = pow2( outsideIOR / iridescenceIOR ) * ( 1.0 - pow2( cosTheta1 ) );
float cosTheta2Sq = 1.0 - sinTheta2Sq;
if ( cosTheta2Sq < 0.0 ) {
return vec3( 1.0 );
}
float cosTheta2 = sqrt( cosTheta2Sq );
float R0 = IorToFresnel0( iridescenceIOR, outsideIOR );
float R12 = F_Schlick( R0, 1.0, cosTheta1 );
float T121 = 1.0 - R12;
float phi12 = 0.0;
if ( iridescenceIOR < outsideIOR ) phi12 = PI;
float phi21 = PI - phi12;
vec3 baseIOR = Fresnel0ToIor( clamp( baseF0, 0.0, 0.9999 ) );
vec3 R1 = IorToFresnel0( baseIOR, iridescenceIOR );
vec3 R23 = F_Schlick( R1, 1.0, cosTheta2 );
vec3 phi23 = vec3( 0.0 );
if ( baseIOR[ 0 ] < iridescenceIOR ) phi23[ 0 ] = PI;
if ( baseIOR[ 1 ] < iridescenceIOR ) phi23[ 1 ] = PI;
if ( baseIOR[ 2 ] < iridescenceIOR ) phi23[ 2 ] = PI;
float OPD = 2.0 * iridescenceIOR * thinFilmThickness * cosTheta2;
vec3 phi = vec3( phi21 ) + phi23;
vec3 R123 = clamp( R12 * R23, 1e-5, 0.9999 );
vec3 r123 = sqrt( R123 );
vec3 Rs = pow2( T121 ) * R23 / ( vec3( 1.0 ) - R123 );
vec3 C0 = R12 + Rs;
I = C0;
vec3 Cm = Rs - T121;
for ( int m = 1; m <= 2; ++ m ) {
Cm *= r123;
vec3 Sm = 2.0 * evalSensitivity( float( m ) * OPD, float( m ) * phi );
I += Cm * Sm;
}
return max( I, vec3( 0.0 ) );
}
#endif
`;var Tu=`#ifdef USE_BUMPMAP
uniform sampler2D bumpMap;
uniform float bumpScale;
vec2 dHdxy_fwd() {
vec2 dSTdx = dFdx( vBumpMapUv );
vec2 dSTdy = dFdy( vBumpMapUv );
float Hll = bumpScale * texture2D( bumpMap, vBumpMapUv ).x;
float dBx = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdx ).x - Hll;
float dBy = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdy ).x - Hll;
return vec2( dBx, dBy );
}
vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );
vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );
vec3 vN = surf_norm;
vec3 R1 = cross( vSigmaY, vN );
vec3 R2 = cross( vN, vSigmaX );
float fDet = dot( vSigmaX, R1 ) * faceDirection;
vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
return normalize( abs( fDet ) * surf_norm - vGrad );
}
#endif
`;var Au=`#if NUM_CLIPPING_PLANES > 0
vec4 plane;
#ifdef ALPHA_TO_COVERAGE
float distanceToPlane, distanceGradient;
float clipOpacity = 1.0;
#pragma unroll_loop_start
for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
plane = clippingPlanes[ i ];
distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
distanceGradient = fwidth( distanceToPlane ) / 2.0;
clipOpacity *= smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
if ( clipOpacity == 0.0 ) discard;
}
#pragma unroll_loop_end
#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
float unionClipOpacity = 1.0;
#pragma unroll_loop_start
for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
plane = clippingPlanes[ i ];
distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
distanceGradient = fwidth( distanceToPlane ) / 2.0;
unionClipOpacity *= 1.0 - smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
}
#pragma unroll_loop_end
clipOpacity *= 1.0 - unionClipOpacity;
#endif
diffuseColor.a *= clipOpacity;
if ( diffuseColor.a == 0.0 ) discard;
#else
#pragma unroll_loop_start
for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
plane = clippingPlanes[ i ];
if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;
}
#pragma unroll_loop_end
#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
bool clipped = true;
#pragma unroll_loop_start
for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
plane = clippingPlanes[ i ];
clipped = ( dot( vClipPosition, plane.xyz ) > plane.w ) && clipped;
}
#pragma unroll_loop_end
if ( clipped ) discard;
#endif
#endif
#endif
`;var wu=`#if NUM_CLIPPING_PLANES > 0
varying vec3 vClipPosition;
uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif
`;var Ru=`#if NUM_CLIPPING_PLANES > 0
varying vec3 vClipPosition;
#endif
`;var Cu=`#if NUM_CLIPPING_PLANES > 0
vClipPosition = - mvPosition.xyz;
#endif
`;var Pu=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
diffuseColor *= vColor;
#endif
`;var Lu=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
varying vec4 vColor;
#endif
`;var Du=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
varying vec4 vColor;
#endif
`;var Iu=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
vColor = vec4( 1.0 );
#endif
#ifdef USE_COLOR_ALPHA
vColor *= color;
#elif defined( USE_COLOR )
vColor.rgb *= color;
#endif
#ifdef USE_INSTANCING_COLOR
vColor.rgb *= instanceColor.rgb;
#endif
#ifdef USE_BATCHING_COLOR
vColor *= getBatchingColor( getIndirectIndex( gl_DrawID ) );
#endif
`;var Fu=`#define PI 3.141592653589793
#define PI2 6.283185307179586
#define PI_HALF 1.5707963267948966
#define RECIPROCAL_PI 0.3183098861837907
#define RECIPROCAL_PI2 0.15915494309189535
#define EPSILON 1e-6
#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
#define whiteComplement( a ) ( 1.0 - saturate( a ) )
float pow2( const in float x ) { return x*x; }
vec3 pow2( const in vec3 x ) { return x*x; }
float pow3( const in float x ) { return x*x*x; }
float pow4( const in float x ) { float x2 = x*x; return x2*x2; }
float max3( const in vec3 v ) { return max( max( v.x, v.y ), v.z ); }
float average( const in vec3 v ) { return dot( v, vec3( 0.3333333 ) ); }
highp float rand( const in vec2 uv ) {
const highp float a = 12.9898, b = 78.233, c = 43758.5453;
highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
return fract( sin( sn ) * c );
}
#ifdef HIGH_PRECISION
float precisionSafeLength( vec3 v ) { return length( v ); }
#else
float precisionSafeLength( vec3 v ) {
float maxComponent = max3( abs( v ) );
return length( v / maxComponent ) * maxComponent;
}
#endif
struct IncidentLight {
vec3 color;
vec3 direction;
bool visible;
};
struct ReflectedLight {
vec3 directDiffuse;
vec3 directSpecular;
vec3 indirectDiffuse;
vec3 indirectSpecular;
};
#ifdef USE_ALPHAHASH
varying vec3 vPosition;
#endif
vec3 transformDirection( in vec3 dir, in mat4 matrix ) {
return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
}
#define inverseTransformDirection transformDirectionByInverseViewMatrix
vec3 transformNormalByInverseViewMatrix( in vec3 normal, in mat4 viewMatrix ) {
return normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
}
vec3 transformDirectionByInverseViewMatrix( in vec3 dir, in mat4 viewMatrix ) {
return normalize( ( vec4( dir, 0.0 ) * viewMatrix ).xyz );
}
bool isPerspectiveMatrix( mat4 m ) {
return m[ 2 ][ 3 ] == - 1.0;
}
vec2 equirectUv( in vec3 dir ) {
float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;
float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;
return vec2( u, v );
}
vec3 BRDF_Lambert( const in vec3 diffuseColor ) {
return RECIPROCAL_PI * diffuseColor;
}
vec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {
float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
}
float F_Schlick( const in float f0, const in float f90, const in float dotVH ) {
float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
}
`;var Uu=`#ifdef ENVMAP_TYPE_CUBE_UV
#define cubeUV_minMipLevel 4.0
#define cubeUV_minTileSize 16.0
float getFace( vec3 direction ) {
vec3 absDirection = abs( direction );
float face = - 1.0;
if ( absDirection.x > absDirection.z ) {
if ( absDirection.x > absDirection.y )
face = direction.x > 0.0 ? 0.0 : 3.0;
else
face = direction.y > 0.0 ? 1.0 : 4.0;
} else {
if ( absDirection.z > absDirection.y )
face = direction.z > 0.0 ? 2.0 : 5.0;
else
face = direction.y > 0.0 ? 1.0 : 4.0;
}
return face;
}
vec2 getUV( vec3 direction, float face ) {
vec2 uv;
if ( face == 0.0 ) {
uv = vec2( direction.z, direction.y ) / abs( direction.x );
} else if ( face == 1.0 ) {
uv = vec2( - direction.x, - direction.z ) / abs( direction.y );
} else if ( face == 2.0 ) {
uv = vec2( - direction.x, direction.y ) / abs( direction.z );
} else if ( face == 3.0 ) {
uv = vec2( - direction.z, direction.y ) / abs( direction.x );
} else if ( face == 4.0 ) {
uv = vec2( - direction.x, direction.z ) / abs( direction.y );
} else {
uv = vec2( direction.x, direction.y ) / abs( direction.z );
}
return 0.5 * ( uv + 1.0 );
}
vec3 bilinearCubeUV( sampler2D envMap, vec3 direction, float mipInt ) {
float face = getFace( direction );
float filterInt = max( cubeUV_minMipLevel - mipInt, 0.0 );
mipInt = max( mipInt, cubeUV_minMipLevel );
float faceSize = exp2( mipInt );
highp vec2 uv = getUV( direction, face ) * ( faceSize - 2.0 ) + 1.0;
if ( face > 2.0 ) {
uv.y += faceSize;
face -= 3.0;
}
uv.x += face * faceSize;
uv.x += filterInt * 3.0 * cubeUV_minTileSize;
uv.y += 4.0 * ( exp2( CUBEUV_MAX_MIP ) - faceSize );
uv.x *= CUBEUV_TEXEL_WIDTH;
uv.y *= CUBEUV_TEXEL_HEIGHT;
#ifdef texture2DGradEXT
return texture2DGradEXT( envMap, uv, vec2( 0.0 ), vec2( 0.0 ) ).rgb;
#else
return texture2D( envMap, uv ).rgb;
#endif
}
#define cubeUV_r0 1.0
#define cubeUV_m0 - 2.0
#define cubeUV_r1 0.8
#define cubeUV_m1 - 1.0
#define cubeUV_r4 0.4
#define cubeUV_m4 2.0
#define cubeUV_r5 0.305
#define cubeUV_m5 3.0
#define cubeUV_r6 0.21
#define cubeUV_m6 4.0
float roughnessToMip( float roughness ) {
float mip = 0.0;
if ( roughness >= cubeUV_r1 ) {
mip = ( cubeUV_r0 - roughness ) * ( cubeUV_m1 - cubeUV_m0 ) / ( cubeUV_r0 - cubeUV_r1 ) + cubeUV_m0;
} else if ( roughness >= cubeUV_r4 ) {
mip = ( cubeUV_r1 - roughness ) * ( cubeUV_m4 - cubeUV_m1 ) / ( cubeUV_r1 - cubeUV_r4 ) + cubeUV_m1;
} else if ( roughness >= cubeUV_r5 ) {
mip = ( cubeUV_r4 - roughness ) * ( cubeUV_m5 - cubeUV_m4 ) / ( cubeUV_r4 - cubeUV_r5 ) + cubeUV_m4;
} else if ( roughness >= cubeUV_r6 ) {
mip = ( cubeUV_r5 - roughness ) * ( cubeUV_m6 - cubeUV_m5 ) / ( cubeUV_r5 - cubeUV_r6 ) + cubeUV_m5;
} else {
mip = - 2.0 * log2( 1.16 * roughness );
}
return mip;
}
vec4 textureCubeUV( sampler2D envMap, vec3 sampleDir, float roughness ) {
float mip = clamp( roughnessToMip( roughness ), cubeUV_m0, CUBEUV_MAX_MIP );
float mipF = fract( mip );
float mipInt = floor( mip );
vec3 color0 = bilinearCubeUV( envMap, sampleDir, mipInt );
if ( mipF == 0.0 ) {
return vec4( color0, 1.0 );
} else {
vec3 color1 = bilinearCubeUV( envMap, sampleDir, mipInt + 1.0 );
return vec4( mix( color0, color1, mipF ), 1.0 );
}
}
#endif
`;var Nu=`vec3 transformedNormal = objectNormal;
#ifdef USE_TANGENT
vec3 transformedTangent = objectTangent;
#endif
#ifdef USE_BATCHING
mat3 bm = mat3( batchingMatrix );
transformedNormal /= vec3( dot( bm[ 0 ], bm[ 0 ] ), dot( bm[ 1 ], bm[ 1 ] ), dot( bm[ 2 ], bm[ 2 ] ) );
transformedNormal = bm * transformedNormal;
#ifdef USE_TANGENT
transformedTangent = bm * transformedTangent;
#endif
#endif
#ifdef USE_INSTANCING
mat3 im = mat3( instanceMatrix );
transformedNormal /= vec3( dot( im[ 0 ], im[ 0 ] ), dot( im[ 1 ], im[ 1 ] ), dot( im[ 2 ], im[ 2 ] ) );
transformedNormal = im * transformedNormal;
#ifdef USE_TANGENT
transformedTangent = im * transformedTangent;
#endif
#endif
transformedNormal = normalMatrix * transformedNormal;
#ifdef FLIP_SIDED
transformedNormal = - transformedNormal;
#endif
#ifdef USE_TANGENT
transformedTangent = ( modelViewMatrix * vec4( transformedTangent, 0.0 ) ).xyz;
#endif
`;var Ou=`#ifdef USE_DISPLACEMENTMAP
uniform sampler2D displacementMap;
uniform float displacementScale;
uniform float displacementBias;
#endif
`;var Bu=`#ifdef USE_DISPLACEMENTMAP
transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif
`;var Gu=`#ifdef USE_EMISSIVEMAP
vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
emissiveColor = sRGBTransferEOTF( emissiveColor );
#endif
totalEmissiveRadiance *= emissiveColor.rgb;
#endif
`;var zu=`#ifdef USE_EMISSIVEMAP
uniform sampler2D emissiveMap;
#endif
`;var Vu=`gl_FragColor = linearToOutputTexel( gl_FragColor );
`;var Hu=`vec4 LinearTransferOETF( in vec4 value ) {
return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}
`;var ku=`#ifdef USE_ENVMAP
#ifdef ENV_WORLDPOS
vec3 cameraToFrag;
if ( isOrthographic ) {
cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
} else {
cameraToFrag = normalize( vWorldPosition - cameraPosition );
}
vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
#ifdef ENVMAP_MODE_REFLECTION
vec3 reflectVec = reflect( cameraToFrag, worldNormal );
#else
vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );
#endif
#else
vec3 reflectVec = vReflect;
#endif
#ifdef ENVMAP_TYPE_CUBE
vec4 envColor = textureCube( envMap, envMapRotation * reflectVec );
#ifdef ENVMAP_BLENDING_MULTIPLY
outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );
#elif defined( ENVMAP_BLENDING_MIX )
outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );
#elif defined( ENVMAP_BLENDING_ADD )
outgoingLight += envColor.xyz * specularStrength * reflectivity;
#endif
#endif
#endif
`;var Wu=`#ifdef USE_ENVMAP
uniform float envMapIntensity;
uniform mat3 envMapRotation;
#ifdef ENVMAP_TYPE_CUBE
uniform samplerCube envMap;
#else
uniform sampler2D envMap;
#endif
#endif
`;var Xu=`#ifdef USE_ENVMAP
uniform float reflectivity;
#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
#define ENV_WORLDPOS
#endif
#ifdef ENV_WORLDPOS
varying vec3 vWorldPosition;
uniform float refractionRatio;
#else
varying vec3 vReflect;
#endif
#endif
`;var qu=`#ifdef USE_ENVMAP
#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
#define ENV_WORLDPOS
#endif
#ifdef ENV_WORLDPOS
varying vec3 vWorldPosition;
#else
varying vec3 vReflect;
uniform float refractionRatio;
#endif
#endif
`;var Yu=`#ifdef USE_ENVMAP
#ifdef ENV_WORLDPOS
vWorldPosition = worldPosition.xyz;
#else
vec3 cameraToVertex;
if ( isOrthographic ) {
cameraToVertex = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
} else {
cameraToVertex = normalize( worldPosition.xyz - cameraPosition );
}
vec3 worldNormal = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );
#ifdef ENVMAP_MODE_REFLECTION
vReflect = reflect( cameraToVertex, worldNormal );
#else
vReflect = refract( cameraToVertex, worldNormal, refractionRatio );
#endif
#endif
#endif
`;var Zu=`#ifdef USE_FOG
vFogDepth = - mvPosition.z;
#endif
`;var Ku=`#ifdef USE_FOG
varying float vFogDepth;
#endif
`;var Ju=`#ifdef USE_FOG
#ifdef FOG_EXP2
float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
#else
float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
#endif
gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif
`;var $u=`#ifdef USE_FOG
uniform vec3 fogColor;
varying float vFogDepth;
#ifdef FOG_EXP2
uniform float fogDensity;
#else
uniform float fogNear;
uniform float fogFar;
#endif
#endif
`;var Qu=`#ifdef USE_GRADIENTMAP
uniform sampler2D gradientMap;
#endif
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
float dotNL = dot( normal, lightDirection );
vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
#ifdef USE_GRADIENTMAP
return vec3( texture2D( gradientMap, coord ).r );
#else
vec2 fw = fwidth( coord ) * 0.5;
return mix( vec3( 0.7 ), vec3( 1.0 ), smoothstep( 0.7 - fw.x, 0.7 + fw.x, coord.x ) );
#endif
}
`;var ju=`#ifdef USE_LIGHTMAP
uniform sampler2D lightMap;
uniform float lightMapIntensity;
#endif
`;var eh=`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;
`;var th=`varying vec3 vViewPosition;
struct LambertMaterial {
vec3 diffuseColor;
float specularStrength;
};
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
vec3 irradiance = dotNL * directLight.color;
reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct RE_Direct_Lambert
#define RE_IndirectDiffuse RE_IndirectDiffuse_Lambert
`;var ih=`uniform bool receiveShadow;
uniform vec3 ambientLightColor;
#if defined( USE_LIGHT_PROBES )
uniform vec3 lightProbe[ 9 ];
#endif
vec3 shGetIrradianceAt( in vec3 normal, in vec3 shCoefficients[ 9 ] ) {
float x = normal.x, y = normal.y, z = normal.z;
vec3 result = shCoefficients[ 0 ] * 0.886227;
result += shCoefficients[ 1 ] * 2.0 * 0.511664 * y;
result += shCoefficients[ 2 ] * 2.0 * 0.511664 * z;
result += shCoefficients[ 3 ] * 2.0 * 0.511664 * x;
result += shCoefficients[ 4 ] * 2.0 * 0.429043 * x * y;
result += shCoefficients[ 5 ] * 2.0 * 0.429043 * y * z;
result += shCoefficients[ 6 ] * ( 0.743125 * z * z - 0.247708 );
result += shCoefficients[ 7 ] * 2.0 * 0.429043 * x * z;
result += shCoefficients[ 8 ] * 0.429043 * ( x * x - y * y );
return result;
}
vec3 getLightProbeIrradiance( const in vec3 lightProbe[ 9 ], const in vec3 normal ) {
vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
vec3 irradiance = shGetIrradianceAt( worldNormal, lightProbe );
return irradiance;
}
vec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {
vec3 irradiance = ambientLightColor;
return irradiance;
}
float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );
if ( cutoffDistance > 0.0 ) {
distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );
}
return distanceFalloff;
}
float getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {
return smoothstep( coneCosine, penumbraCosine, angleCosine );
}
#if NUM_SUN_LIGHTS > 0
struct SunLight {
vec3 direction;
vec3 color;
};
uniform SunLight sunLights[ NUM_SUN_LIGHTS ];
void getSunLightInfo( const in SunLight sunLight, out IncidentLight light ) {
light.color = sunLight.color;
light.direction = sunLight.direction;
light.visible = true;
}
#endif
#if NUM_DIR_LIGHTS > 0
struct DirectionalLight {
vec3 direction;
vec3 color;
};
uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
void getDirectionalLightInfo( const in DirectionalLight directionalLight, out IncidentLight light ) {
light.color = directionalLight.color;
light.direction = directionalLight.direction;
light.visible = true;
}
#endif
#if NUM_POINT_LIGHTS > 0
struct PointLight {
vec3 position;
vec3 color;
float distance;
float decay;
};
uniform PointLight pointLights[ NUM_POINT_LIGHTS ];
void getPointLightInfo( const in PointLight pointLight, const in vec3 geometryPosition, out IncidentLight light ) {
vec3 lVector = pointLight.position - geometryPosition;
light.direction = normalize( lVector );
float lightDistance = length( lVector );
light.color = pointLight.color;
light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );
light.visible = ( light.color != vec3( 0.0 ) );
}
#endif
#if NUM_SPOT_LIGHTS > 0
struct SpotLight {
vec3 position;
vec3 direction;
vec3 color;
float distance;
float decay;
float coneCos;
float penumbraCos;
};
uniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];
void getSpotLightInfo( const in SpotLight spotLight, const in vec3 geometryPosition, out IncidentLight light ) {
vec3 lVector = spotLight.position - geometryPosition;
light.direction = normalize( lVector );
float angleCos = dot( light.direction, spotLight.direction );
float spotAttenuation = getSpotAttenuation( spotLight.coneCos, spotLight.penumbraCos, angleCos );
if ( spotAttenuation > 0.0 ) {
float lightDistance = length( lVector );
light.color = spotLight.color * spotAttenuation;
light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );
light.visible = ( light.color != vec3( 0.0 ) );
} else {
light.color = vec3( 0.0 );
light.visible = false;
}
}
#endif
#if NUM_RECT_AREA_LIGHTS > 0
struct RectAreaLight {
vec3 color;
vec3 position;
vec3 halfWidth;
vec3 halfHeight;
};
uniform sampler2D ltc_1;
uniform sampler2D ltc_2;
uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];
#endif
#if NUM_HEMI_LIGHTS > 0
struct HemisphereLight {
vec3 direction;
vec3 skyColor;
vec3 groundColor;
};
uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];
vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in vec3 normal ) {
float dotNL = dot( normal, hemiLight.direction );
float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );
return irradiance;
}
#endif
#include <lightprobes_pars_fragment>
`;var nh=`#ifdef USE_ENVMAP
vec3 getIBLIrradiance( const in vec3 normal ) {
#ifdef ENVMAP_TYPE_CUBE_UV
vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );
return PI * envMapColor.rgb * envMapIntensity;
#else
return vec3( 0.0 );
#endif
}
vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
#ifdef ENVMAP_TYPE_CUBE_UV
vec3 reflectVec = reflect( - viewDir, normal );
reflectVec = normalize( mix( reflectVec, normal, pow4( roughness ) ) );
reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );
vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );
return envMapColor.rgb * envMapIntensity;
#else
return vec3( 0.0 );
#endif
}
#ifdef USE_RETROREFLECTION
vec3 getIBLRetroRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
#ifdef ENVMAP_TYPE_CUBE_UV
vec3 retroVec = normalize( mix( viewDir, normal, pow4( roughness ) ) );
retroVec = transformDirectionByInverseViewMatrix( retroVec, viewMatrix );
vec4 envMapColor = textureCubeUV( envMap, envMapRotation * retroVec, roughness );
return envMapColor.rgb * envMapIntensity;
#else
return vec3( 0.0 );
#endif
}
#endif
#ifdef USE_ANISOTROPY
vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
#ifdef ENVMAP_TYPE_CUBE_UV
vec3 bentNormal = cross( bitangent, viewDir );
bentNormal = normalize( cross( bentNormal, bitangent ) );
bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
return getIBLRadiance( viewDir, bentNormal, roughness );
#else
return vec3( 0.0 );
#endif
}
#ifdef USE_RETROREFLECTION
vec3 getIBLAnisotropyRetroRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
#ifdef ENVMAP_TYPE_CUBE_UV
vec3 bentNormal = cross( bitangent, viewDir );
bentNormal = normalize( cross( bentNormal, bitangent ) );
bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
return getIBLRetroRadiance( viewDir, bentNormal, roughness );
#else
return vec3( 0.0 );
#endif
}
#endif
#endif
#endif
`;var rh=`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;
`;var oh=`varying vec3 vViewPosition;
struct ToonMaterial {
vec3 diffuseColor;
};
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;
reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct RE_Direct_Toon
#define RE_IndirectDiffuse RE_IndirectDiffuse_Toon
`;var sh=`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;
`;var ah=`varying vec3 vViewPosition;
struct BlinnPhongMaterial {
vec3 diffuseColor;
vec3 specularColor;
float specularShininess;
float specularStrength;
};
void RE_Direct_BlinnPhong( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
vec3 irradiance = dotNL * directLight.color;
reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
reflectedLight.directSpecular += irradiance * BRDF_BlinnPhong( directLight.direction, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess ) * material.specularStrength;
}
void RE_IndirectDiffuse_BlinnPhong( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct RE_Direct_BlinnPhong
#define RE_IndirectDiffuse RE_IndirectDiffuse_BlinnPhong
`;var lh=`PhysicalMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.diffuseContribution = diffuseColor.rgb * ( 1.0 - metalnessFactor );
material.metalness = metalnessFactor;
vec3 dxy = max( abs( dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) ) );
float geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );
material.roughness = max( roughnessFactor, 0.0525 );
material.roughness += geometryRoughness;
material.roughness = min( material.roughness, 1.0 );
#ifdef IOR
material.ior = ior;
#ifdef USE_SPECULAR
float specularIntensityFactor = specularIntensity;
vec3 specularColorFactor = specularColor;
#ifdef USE_SPECULAR_COLORMAP
specularColorFactor *= texture2D( specularColorMap, vSpecularColorMapUv ).rgb;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
specularIntensityFactor *= texture2D( specularIntensityMap, vSpecularIntensityMapUv ).a;
#endif
material.specularF90 = mix( specularIntensityFactor, 1.0, metalnessFactor );
#else
float specularIntensityFactor = 1.0;
vec3 specularColorFactor = vec3( 1.0 );
material.specularF90 = 1.0;
#endif
material.specularColor = min( pow2( ( material.ior - 1.0 ) / ( material.ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor;
material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
#else
material.specularColor = vec3( 0.04 );
material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
material.specularF90 = 1.0;
#endif
#ifdef USE_CLEARCOAT
material.clearcoat = clearcoat;
material.clearcoatRoughness = clearcoatRoughness;
material.clearcoatF0 = vec3( 0.04 );
material.clearcoatF90 = 1.0;
#ifdef USE_CLEARCOATMAP
material.clearcoat *= texture2D( clearcoatMap, vClearcoatMapUv ).x;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
material.clearcoatRoughness *= texture2D( clearcoatRoughnessMap, vClearcoatRoughnessMapUv ).y;
#endif
material.clearcoat = saturate( material.clearcoat );
material.clearcoatRoughness = max( material.clearcoatRoughness, 0.0525 );
material.clearcoatRoughness += geometryRoughness;
material.clearcoatRoughness = min( material.clearcoatRoughness, 1.0 );
#endif
#ifdef USE_DISPERSION
material.dispersion = dispersion;
#endif
#ifdef USE_RETROREFLECTION
material.retroreflectivity = retroreflectivity;
#endif
#ifdef USE_IRIDESCENCE
material.iridescence = iridescence;
material.iridescenceIOR = iridescenceIOR;
#ifdef USE_IRIDESCENCEMAP
material.iridescence *= texture2D( iridescenceMap, vIridescenceMapUv ).r;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
material.iridescenceThickness = (iridescenceThicknessMaximum - iridescenceThicknessMinimum) * texture2D( iridescenceThicknessMap, vIridescenceThicknessMapUv ).g + iridescenceThicknessMinimum;
#else
material.iridescenceThickness = iridescenceThicknessMaximum;
#endif
#endif
#ifdef USE_SHEEN
material.sheenColor = sheenColor;
#ifdef USE_SHEEN_COLORMAP
material.sheenColor *= texture2D( sheenColorMap, vSheenColorMapUv ).rgb;
#endif
material.sheenRoughness = clamp( sheenRoughness, 0.0001, 1.0 );
#ifdef USE_SHEEN_ROUGHNESSMAP
material.sheenRoughness *= texture2D( sheenRoughnessMap, vSheenRoughnessMapUv ).a;
#endif
#endif
#ifdef USE_ANISOTROPY
#ifdef USE_ANISOTROPYMAP
mat2 anisotropyMat = mat2( anisotropyVector.x, anisotropyVector.y, - anisotropyVector.y, anisotropyVector.x );
vec3 anisotropyPolar = texture2D( anisotropyMap, vAnisotropyMapUv ).rgb;
vec2 anisotropyV = anisotropyMat * normalize( 2.0 * anisotropyPolar.rg - vec2( 1.0 ) ) * anisotropyPolar.b;
#else
vec2 anisotropyV = anisotropyVector;
#endif
material.anisotropy = length( anisotropyV );
if( material.anisotropy == 0.0 ) {
anisotropyV = vec2( 1.0, 0.0 );
} else {
anisotropyV /= material.anisotropy;
material.anisotropy = saturate( material.anisotropy );
}
material.alphaT = mix( pow2( material.roughness ), 1.0, pow2( material.anisotropy ) );
material.anisotropyT = tbn[ 0 ] * anisotropyV.x + tbn[ 1 ] * anisotropyV.y;
material.anisotropyB = tbn[ 1 ] * anisotropyV.x - tbn[ 0 ] * anisotropyV.y;
#endif
`;var ch=`uniform sampler2D dfgLUT;
struct PhysicalMaterial {
vec3 diffuseColor;
vec3 diffuseContribution;
vec3 specularColor;
vec3 specularColorBlended;
float roughness;
float metalness;
float specularF90;
float dispersion;
vec2 dfg;
vec3 multiScatteringCompensation;
#ifdef USE_RETROREFLECTION
float retroreflectivity;
#endif
#ifdef USE_CLEARCOAT
float clearcoat;
float clearcoatRoughness;
vec3 clearcoatF0;
float clearcoatF90;
#endif
#ifdef USE_IRIDESCENCE
float iridescence;
float iridescenceIOR;
float iridescenceThickness;
vec3 iridescenceFresnel;
vec3 iridescenceF0Dielectric;
vec3 iridescenceF0Metallic;
#endif
#ifdef USE_SHEEN
vec3 sheenColor;
float sheenRoughness;
#endif
#ifdef IOR
float ior;
#endif
#ifdef USE_TRANSMISSION
float transmission;
float transmissionAlpha;
float thickness;
float attenuationDistance;
vec3 attenuationColor;
#endif
#ifdef USE_ANISOTROPY
float anisotropy;
float alphaT;
vec3 anisotropyT;
vec3 anisotropyB;
#endif
};
vec3 clearcoatSpecularDirect = vec3( 0.0 );
vec3 clearcoatSpecularIndirect = vec3( 0.0 );
vec3 sheenSpecularDirect = vec3( 0.0 );
vec3 sheenSpecularIndirect = vec3(0.0 );
vec3 Schlick_to_F0( const in vec3 f, const in float f90, const in float dotVH ) {
float x = clamp( 1.0 - dotVH, 0.0, 1.0 );
float x2 = x * x;
float x5 = clamp( x * x2 * x2, 0.0, 0.9999 );
return ( f - vec3( f90 ) * x5 ) / ( 1.0 - x5 );
}
float V_GGX_SmithCorrelated( const in float alpha, const in float dotNL, const in float dotNV ) {
float a2 = pow2( alpha );
float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );
return 0.5 / max( gv + gl, EPSILON );
}
float D_GGX( const in float alpha, const in float dotNH ) {
float a2 = pow2( alpha );
float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0;
return RECIPROCAL_PI * a2 / pow2( denom );
}
#ifdef USE_ANISOTROPY
float V_GGX_SmithCorrelated_Anisotropic( const in float alphaT, const in float alphaB, const in float dotTV, const in float dotBV, const in float dotTL, const in float dotBL, const in float dotNV, const in float dotNL ) {
float gv = dotNL * length( vec3( alphaT * dotTV, alphaB * dotBV, dotNV ) );
float gl = dotNV * length( vec3( alphaT * dotTL, alphaB * dotBL, dotNL ) );
return 0.5 / max( gv + gl, EPSILON );
}
float D_GGX_Anisotropic( const in float alphaT, const in float alphaB, const in float dotNH, const in float dotTH, const in float dotBH ) {
float a2 = alphaT * alphaB;
highp vec3 v = vec3( alphaB * dotTH, alphaT * dotBH, a2 * dotNH );
highp float v2 = dot( v, v );
float w2 = a2 / v2;
return RECIPROCAL_PI * a2 * pow2 ( w2 );
}
#endif
#ifdef USE_CLEARCOAT
vec3 BRDF_GGX_Clearcoat( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material) {
vec3 f0 = material.clearcoatF0;
float f90 = material.clearcoatF90;
float roughness = material.clearcoatRoughness;
float alpha = pow2( roughness );
vec3 halfDir = normalize( lightDir + viewDir );
float dotNL = saturate( dot( normal, lightDir ) );
float dotNV = saturate( dot( normal, viewDir ) );
float dotNH = saturate( dot( normal, halfDir ) );
float dotVH = saturate( dot( viewDir, halfDir ) );
vec3 F = F_Schlick( f0, f90, dotVH );
float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
float D = D_GGX( alpha, dotNH );
return F * ( V * D );
}
#endif
vec3 BRDF_GGX( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
vec3 f0 = material.specularColorBlended;
float f90 = material.specularF90;
float roughness = material.roughness;
float alpha = pow2( roughness );
vec3 halfDir = normalize( lightDir + viewDir );
float dotNL = saturate( dot( normal, lightDir ) );
float dotNV = saturate( dot( normal, viewDir ) );
float dotNH = saturate( dot( normal, halfDir ) );
float dotVH = saturate( dot( viewDir, halfDir ) );
vec3 F = F_Schlick( f0, f90, dotVH );
#ifdef USE_IRIDESCENCE
F = mix( F, material.iridescenceFresnel, material.iridescence );
#endif
#ifdef USE_ANISOTROPY
float dotTL = dot( material.anisotropyT, lightDir );
float dotTV = dot( material.anisotropyT, viewDir );
float dotTH = dot( material.anisotropyT, halfDir );
float dotBL = dot( material.anisotropyB, lightDir );
float dotBV = dot( material.anisotropyB, viewDir );
float dotBH = dot( material.anisotropyB, halfDir );
float V = V_GGX_SmithCorrelated_Anisotropic( material.alphaT, alpha, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL );
float D = D_GGX_Anisotropic( material.alphaT, alpha, dotNH, dotTH, dotBH );
#else
float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
float D = D_GGX( alpha, dotNH );
#endif
return F * ( V * D );
}
vec2 LTC_Uv( const in vec3 N, const in vec3 V, const in float roughness ) {
const float LUT_SIZE = 64.0;
const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;
const float LUT_BIAS = 0.5 / LUT_SIZE;
float dotNV = saturate( dot( N, V ) );
vec2 uv = vec2( roughness, sqrt( 1.0 - dotNV ) );
uv = uv * LUT_SCALE + LUT_BIAS;
return uv;
}
float LTC_ClippedSphereFormFactor( const in vec3 f ) {
float l = length( f );
return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );
}
vec3 LTC_EdgeVectorFormFactor( const in vec3 v1, const in vec3 v2 ) {
float x = dot( v1, v2 );
float y = abs( x );
float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;
float b = 3.4175940 + ( 4.1616724 + y ) * y;
float v = a / b;
float theta_sintheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;
return cross( v1, v2 ) * theta_sintheta;
}
vec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[ 4 ] ) {
vec3 v1 = rectCoords[ 1 ] - rectCoords[ 0 ];
vec3 v2 = rectCoords[ 3 ] - rectCoords[ 0 ];
vec3 lightNormal = cross( v1, v2 );
if( dot( lightNormal, P - rectCoords[ 0 ] ) < 0.0 ) return vec3( 0.0 );
vec3 T1, T2;
T1 = normalize( V - N * dot( V, N ) );
T2 = - cross( N, T1 );
mat3 mat = mInv * transpose( mat3( T1, T2, N ) );
vec3 coords[ 4 ];
coords[ 0 ] = mat * ( rectCoords[ 0 ] - P );
coords[ 1 ] = mat * ( rectCoords[ 1 ] - P );
coords[ 2 ] = mat * ( rectCoords[ 2 ] - P );
coords[ 3 ] = mat * ( rectCoords[ 3 ] - P );
coords[ 0 ] = normalize( coords[ 0 ] );
coords[ 1 ] = normalize( coords[ 1 ] );
coords[ 2 ] = normalize( coords[ 2 ] );
coords[ 3 ] = normalize( coords[ 3 ] );
vec3 vectorFormFactor = vec3( 0.0 );
vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 0 ], coords[ 1 ] );
vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 1 ], coords[ 2 ] );
vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 2 ], coords[ 3 ] );
vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 3 ], coords[ 0 ] );
float result = LTC_ClippedSphereFormFactor( vectorFormFactor );
return vec3( result );
}
#if defined( USE_SHEEN )
float D_Charlie( float roughness, float dotNH ) {
float alpha = pow2( roughness );
float invAlpha = 1.0 / alpha;
float cos2h = dotNH * dotNH;
float sin2h = max( 1.0 - cos2h, 0.0078125 );
return ( 2.0 + invAlpha ) * pow( sin2h, invAlpha * 0.5 ) / ( 2.0 * PI );
}
float V_Neubelt( float dotNV, float dotNL ) {
return saturate( 1.0 / ( 4.0 * ( dotNL + dotNV - dotNL * dotNV ) ) );
}
vec3 BRDF_Sheen( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, vec3 sheenColor, const in float sheenRoughness ) {
vec3 halfDir = normalize( lightDir + viewDir );
float dotNL = saturate( dot( normal, lightDir ) );
float dotNV = saturate( dot( normal, viewDir ) );
float dotNH = saturate( dot( normal, halfDir ) );
float D = D_Charlie( sheenRoughness, dotNH );
float V = V_Neubelt( dotNV, dotNL );
return sheenColor * ( D * V );
}
#endif
float IBLSheenBRDF( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
float dotNV = saturate( dot( normal, viewDir ) );
float r2 = roughness * roughness;
float rInv = 1.0 / ( roughness + 0.1 );
float a = -1.9362 + 1.0678 * roughness + 0.4573 * r2 - 0.8469 * rInv;
float b = -0.6014 + 0.5538 * roughness - 0.4670 * r2 - 0.1255 * rInv;
float DG = exp( a * dotNV + b );
return saturate( DG );
}
vec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {
float dotNV = saturate( dot( normal, viewDir ) );
vec2 fab = texture2D( dfgLUT, vec2( roughness, dotNV ) ).rg;
return specularColor * fab.x + specularF90 * fab.y;
}
#ifdef USE_IRIDESCENCE
void computeMultiscatteringIridescence( const in vec2 fab, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, inout vec3 singleScatter, inout vec3 multiScatter ) {
#else
void computeMultiscattering( const in vec2 fab, const in vec3 specularColor, const in float specularF90, inout vec3 singleScatter, inout vec3 multiScatter ) {
#endif
#ifdef USE_IRIDESCENCE
vec3 Fr = mix( specularColor, iridescenceF0, iridescence );
#else
vec3 Fr = specularColor;
#endif
vec3 FssEss = Fr * fab.x + specularF90 * fab.y;
float Ess = fab.x + fab.y;
float Ems = 1.0 - Ess;
vec3 Favg = Fr + ( 1.0 - Fr ) * 0.047619;
vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );
singleScatter += FssEss;
multiScatter += Fms * Ems;
}
#if NUM_RECT_AREA_LIGHTS > 0
void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
vec3 normal = geometryNormal;
vec3 viewDir = geometryViewDir;
vec3 position = geometryPosition;
vec3 lightPos = rectAreaLight.position;
vec3 halfWidth = rectAreaLight.halfWidth;
vec3 halfHeight = rectAreaLight.halfHeight;
vec3 lightColor = rectAreaLight.color;
float roughness = material.roughness;
vec3 rectCoords[ 4 ];
rectCoords[ 0 ] = lightPos + halfWidth - halfHeight;
rectCoords[ 1 ] = lightPos - halfWidth - halfHeight;
rectCoords[ 2 ] = lightPos - halfWidth + halfHeight;
rectCoords[ 3 ] = lightPos + halfWidth + halfHeight;
vec2 uv = LTC_Uv( normal, viewDir, roughness );
vec4 t1 = texture2D( ltc_1, uv );
vec4 t2 = texture2D( ltc_2, uv );
mat3 mInv = mat3(
vec3( t1.x, 0, t1.y ),
vec3( 0, 1, 0 ),
vec3( t1.z, 0, t1.w )
);
vec3 fresnel = ( material.specularColorBlended * t2.x + ( material.specularF90 - material.specularColorBlended ) * t2.y );
reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );
reflectedLight.directDiffuse += lightColor * material.diffuseContribution * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );
#ifdef USE_CLEARCOAT
vec3 Ncc = geometryClearcoatNormal;
vec2 uvClearcoat = LTC_Uv( Ncc, viewDir, material.clearcoatRoughness );
vec4 t1Clearcoat = texture2D( ltc_1, uvClearcoat );
vec4 t2Clearcoat = texture2D( ltc_2, uvClearcoat );
mat3 mInvClearcoat = mat3(
vec3( t1Clearcoat.x, 0, t1Clearcoat.y ),
vec3( 0, 1, 0 ),
vec3( t1Clearcoat.z, 0, t1Clearcoat.w )
);
vec3 fresnelClearcoat = material.clearcoatF0 * t2Clearcoat.x + ( material.clearcoatF90 - material.clearcoatF0 ) * t2Clearcoat.y;
clearcoatSpecularDirect += lightColor * fresnelClearcoat * LTC_Evaluate( Ncc, viewDir, position, mInvClearcoat, rectCoords );
#endif
}
#endif
void RE_Direct_Physical( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
vec3 irradiance = dotNL * directLight.color;
#ifdef USE_CLEARCOAT
float dotNLcc = saturate( dot( geometryClearcoatNormal, directLight.direction ) );
vec3 ccIrradiance = dotNLcc * directLight.color;
clearcoatSpecularDirect += ccIrradiance * BRDF_GGX_Clearcoat( directLight.direction, geometryViewDir, geometryClearcoatNormal, material );
#endif
#ifdef USE_SHEEN
sheenSpecularDirect += irradiance * BRDF_Sheen( directLight.direction, geometryViewDir, geometryNormal, material.sheenColor, material.sheenRoughness );
float sheenAlbedoV = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
float sheenAlbedoL = IBLSheenBRDF( geometryNormal, directLight.direction, material.sheenRoughness );
float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * max( sheenAlbedoV, sheenAlbedoL );
irradiance *= sheenEnergyComp;
#endif
vec3 specularBRDF = BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );
#ifdef USE_RETROREFLECTION
vec3 retroViewDir = reflect( - geometryViewDir, geometryNormal );
vec3 retroSpecularBRDF = BRDF_GGX( directLight.direction, retroViewDir, geometryNormal, material );
specularBRDF = mix( specularBRDF, retroSpecularBRDF, saturate( material.retroreflectivity ) );
#endif
reflectedLight.directSpecular += irradiance * specularBRDF * material.multiScatteringCompensation;
vec3 halfDir = normalize( directLight.direction + geometryViewDir );
float dotVH = saturate( dot( geometryViewDir, halfDir ) );
vec3 F = F_Schlick( material.specularColor, material.specularF90, dotVH );
#ifdef USE_RETROREFLECTION
vec3 retroHalfDir = normalize( directLight.direction + retroViewDir );
float dotRetroVH = saturate( dot( retroViewDir, retroHalfDir ) );
vec3 retroF = F_Schlick( material.specularColor, material.specularF90, dotRetroVH );
F = mix( F, retroF, saturate( material.retroreflectivity ) );
#endif
reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );
}
void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
vec3 singleScattering = vec3( 0.0 );
vec3 multiScattering = vec3( 0.0 );
#ifdef USE_IRIDESCENCE
computeMultiscatteringIridescence( material.dfg, material.specularColor, material.specularF90, material.iridescence, material.iridescenceF0Dielectric, singleScattering, multiScattering );
#else
computeMultiscattering( material.dfg, material.specularColor, material.specularF90, singleScattering, multiScattering );
#endif
vec3 diffuse = irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - singleScattering - multiScattering );
#ifdef USE_SHEEN
float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
sheenSpecularIndirect += irradiance * material.sheenColor * sheenAlbedo * RECIPROCAL_PI;
float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
diffuse *= sheenEnergyComp;
#endif
reflectedLight.indirectDiffuse += diffuse;
}
void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
#ifdef USE_CLEARCOAT
clearcoatSpecularIndirect += clearcoatRadiance * EnvironmentBRDF( geometryClearcoatNormal, geometryViewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );
#endif
#ifdef USE_SHEEN
sheenSpecularIndirect += irradiance * material.sheenColor * IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness ) * RECIPROCAL_PI;
#endif
vec3 singleScatteringDielectric = vec3( 0.0 );
vec3 multiScatteringDielectric = vec3( 0.0 );
vec3 singleScatteringMetallic = vec3( 0.0 );
vec3 multiScatteringMetallic = vec3( 0.0 );
#ifdef USE_IRIDESCENCE
computeMultiscatteringIridescence( material.dfg, material.specularColor, material.specularF90, material.iridescence, material.iridescenceF0Dielectric, singleScatteringDielectric, multiScatteringDielectric );
computeMultiscatteringIridescence( material.dfg, material.diffuseColor, material.specularF90, material.iridescence, material.iridescenceF0Metallic, singleScatteringMetallic, multiScatteringMetallic );
#else
computeMultiscattering( material.dfg, material.specularColor, material.specularF90, singleScatteringDielectric, multiScatteringDielectric );
computeMultiscattering( material.dfg, material.diffuseColor, material.specularF90, singleScatteringMetallic, multiScatteringMetallic );
#endif
vec3 singleScattering = mix( singleScatteringDielectric, singleScatteringMetallic, material.metalness );
vec3 multiScattering = mix( multiScatteringDielectric, multiScatteringMetallic, material.metalness );
vec3 totalScatteringDielectric = singleScatteringDielectric + multiScatteringDielectric;
vec3 diffuse = material.diffuseContribution * ( 1.0 - totalScatteringDielectric );
vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;
vec3 indirectSpecular = radiance * singleScattering;
indirectSpecular += multiScattering * cosineWeightedIrradiance;
vec3 indirectDiffuse = diffuse * cosineWeightedIrradiance;
#ifdef USE_SHEEN
float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
indirectSpecular *= sheenEnergyComp;
indirectDiffuse *= sheenEnergyComp;
#endif
reflectedLight.indirectSpecular += indirectSpecular;
reflectedLight.indirectDiffuse += indirectDiffuse;
}
#define RE_Direct RE_Direct_Physical
#define RE_Direct_RectArea RE_Direct_RectArea_Physical
#define RE_IndirectDiffuse RE_IndirectDiffuse_Physical
#define RE_IndirectSpecular RE_IndirectSpecular_Physical
float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {
return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}
`;var fh=`vec3 geometryPosition = - vViewPosition;
vec3 geometryNormal = normal;
vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
vec3 geometryClearcoatNormal = vec3( 0.0 );
#ifdef USE_CLEARCOAT
geometryClearcoatNormal = clearcoatNormal;
#endif
#ifdef USE_IRIDESCENCE
float dotNVi = saturate( dot( normal, geometryViewDir ) );
if ( material.iridescenceThickness == 0.0 ) {
material.iridescence = 0.0;
} else {
material.iridescence = saturate( material.iridescence );
}
if ( material.iridescence > 0.0 ) {
vec3 iridescenceFresnelDielectric = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );
vec3 iridescenceFresnelMetallic = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.diffuseColor );
material.iridescenceFresnel = mix( iridescenceFresnelDielectric, iridescenceFresnelMetallic, material.metalness );
material.iridescenceF0Dielectric = Schlick_to_F0( iridescenceFresnelDielectric, 1.0, dotNVi );
material.iridescenceF0Metallic = Schlick_to_F0( iridescenceFresnelMetallic, 1.0, dotNVi );
}
#endif
#ifdef STANDARD
float dotNVms = saturate( dot( geometryNormal, geometryViewDir ) );
material.dfg = texture2D( dfgLUT, vec2( material.roughness, dotNVms ) ).rg;
#if ( NUM_SUN_LIGHTS > 0 || NUM_DIR_LIGHTS > 0 || NUM_POINT_LIGHTS > 0 || NUM_SPOT_LIGHTS > 0 )
float EssMs = material.dfg.x + material.dfg.y;
material.multiScatteringCompensation = 1.0 + material.specularColorBlended * ( 1.0 / EssMs - 1.0 );
#endif
#endif
IncidentLight directLight;
#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )
PointLight pointLight;
#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0
PointLightShadow pointLightShadow;
#endif
#pragma unroll_loop_start
for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
pointLight = pointLights[ i ];
getPointLightInfo( pointLight, geometryPosition, directLight );
#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS ) && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
pointLightShadow = pointLightShadows[ i ];
directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;
#endif
RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
}
#pragma unroll_loop_end
#endif
#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )
SpotLight spotLight;
vec4 spotColor;
vec3 spotLightCoord;
bool inSpotLightMap;
#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
SpotLightShadow spotLightShadow;
#endif
#pragma unroll_loop_start
for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
spotLight = spotLights[ i ];
getSpotLightInfo( spotLight, geometryPosition, directLight );
#if ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
#define SPOT_LIGHT_MAP_INDEX UNROLLED_LOOP_INDEX
#elif ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
#define SPOT_LIGHT_MAP_INDEX NUM_SPOT_LIGHT_MAPS
#else
#define SPOT_LIGHT_MAP_INDEX ( UNROLLED_LOOP_INDEX - NUM_SPOT_LIGHT_SHADOWS + NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
#endif
#if ( SPOT_LIGHT_MAP_INDEX < NUM_SPOT_LIGHT_MAPS )
spotLightCoord = vSpotLightCoord[ i ].xyz / vSpotLightCoord[ i ].w;
inSpotLightMap = all( lessThan( abs( spotLightCoord * 2. - 1. ), vec3( 1.0 ) ) );
spotColor = texture2D( spotLightMap[ SPOT_LIGHT_MAP_INDEX ], spotLightCoord.xy );
directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;
#endif
#undef SPOT_LIGHT_MAP_INDEX
#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
spotLightShadow = spotLightShadows[ i ];
directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowIntensity, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
#endif
RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
}
#pragma unroll_loop_end
#endif
#if ( NUM_SUN_LIGHTS > 0 ) && defined( RE_Direct )
SunLight sunLight;
#if defined( USE_SHADOWMAP ) && NUM_SUN_LIGHT_SHADOWS > 0
SunLightShadow sunLightShadow;
#endif
#pragma unroll_loop_start
for ( int i = 0; i < NUM_SUN_LIGHTS; i ++ ) {
sunLight = sunLights[ i ];
getSunLightInfo( sunLight, directLight );
#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SUN_LIGHT_SHADOWS )
sunLightShadow = sunLightShadows[ i ];
directLight.color *= ( directLight.visible && receiveShadow ) ? getSunShadow( sunShadowMap[ i ], sunLightShadow, UNROLLED_LOOP_INDEX ) : 1.0;
#endif
RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
}
#pragma unroll_loop_end
#endif
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
DirectionalLight directionalLight;
#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
DirectionalLightShadow directionalLightShadow;
#endif
#pragma unroll_loop_start
for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
directionalLight = directionalLights[ i ];
getDirectionalLightInfo( directionalLight, directLight );
#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
directionalLightShadow = directionalLightShadows[ i ];
directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
#endif
RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
}
#pragma unroll_loop_end
#endif
#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )
RectAreaLight rectAreaLight;
#pragma unroll_loop_start
for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {
rectAreaLight = rectAreaLights[ i ];
RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
}
#pragma unroll_loop_end
#endif
#if defined( RE_IndirectDiffuse )
vec3 iblIrradiance = vec3( 0.0 );
vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );
#if defined( USE_LIGHT_PROBES )
irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );
#endif
#if ( NUM_HEMI_LIGHTS > 0 )
#pragma unroll_loop_start
for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );
}
#pragma unroll_loop_end
#endif
#ifdef USE_LIGHT_PROBES_GRID
vec3 probeWorldPos = ( ( vec4( geometryPosition, 1.0 ) - viewMatrix[ 3 ] ) * viewMatrix ).xyz;
vec3 probeWorldNormal = transformNormalByInverseViewMatrix( geometryNormal, viewMatrix );
irradiance += getLightProbeGridIrradiance( probeWorldPos, probeWorldNormal );
#endif
#endif
#if defined( RE_IndirectSpecular )
vec3 radiance = vec3( 0.0 );
vec3 clearcoatRadiance = vec3( 0.0 );
#endif
`;var uh=`#if defined( RE_IndirectDiffuse )
#ifdef USE_LIGHTMAP
vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
irradiance += lightMapIrradiance;
#endif
#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
#if defined( STANDARD ) || defined( LAMBERT ) || defined( PHONG )
iblIrradiance += getIBLIrradiance( geometryNormal );
#endif
#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
#ifdef USE_ANISOTROPY
vec3 iblRadiance = getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
#else
vec3 iblRadiance = getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
#endif
#ifdef USE_RETROREFLECTION
#ifdef USE_ANISOTROPY
vec3 retroIBLRadiance = getIBLAnisotropyRetroRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
#else
vec3 retroIBLRadiance = getIBLRetroRadiance( geometryViewDir, geometryNormal, material.roughness );
#endif
iblRadiance = mix( iblRadiance, retroIBLRadiance, saturate( material.retroreflectivity ) );
#endif
radiance += iblRadiance;
#ifdef USE_CLEARCOAT
clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );
#endif
#endif
`;var hh=`#if defined( RE_IndirectDiffuse )
#if defined( LAMBERT ) || defined( PHONG )
irradiance += iblIrradiance;
#endif
RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
`;var dh=`#ifdef USE_LIGHT_PROBES_GRID
uniform highp sampler3D probesSH;
uniform vec3 probesMin;
uniform vec3 probesMax;
uniform vec3 probesResolution;
vec3 getLightProbeGridIrradiance( vec3 worldPos, vec3 worldNormal ) {
vec3 res = probesResolution;
vec3 gridRange = probesMax - probesMin;
vec3 resMinusOne = res - 1.0;
vec3 probeSpacing = gridRange / resMinusOne;
vec3 samplePos = worldPos + worldNormal * probeSpacing * 0.5;
vec3 uvw = clamp( ( samplePos - probesMin ) / gridRange, 0.0, 1.0 );
uvw = uvw * resMinusOne / res + 0.5 / res;
float nz = res.z;
float paddedSlices = nz + 2.0;
float atlasDepth = 7.0 * paddedSlices;
float uvZBase = uvw.z * nz + 1.0;
vec4 s0 = texture( probesSH, vec3( uvw.xy, ( uvZBase ) / atlasDepth ) );
vec4 s1 = texture( probesSH, vec3( uvw.xy, ( uvZBase + paddedSlices ) / atlasDepth ) );
vec4 s2 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 2.0 * paddedSlices ) / atlasDepth ) );
vec4 s3 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 3.0 * paddedSlices ) / atlasDepth ) );
vec4 s4 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 4.0 * paddedSlices ) / atlasDepth ) );
vec4 s5 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 5.0 * paddedSlices ) / atlasDepth ) );
vec4 s6 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 6.0 * paddedSlices ) / atlasDepth ) );
vec3 c0 = s0.xyz;
vec3 c1 = vec3( s0.w, s1.xy );
vec3 c2 = vec3( s1.zw, s2.x );
vec3 c3 = s2.yzw;
vec3 c4 = s3.xyz;
vec3 c5 = vec3( s3.w, s4.xy );
vec3 c6 = vec3( s4.zw, s5.x );
vec3 c7 = s5.yzw;
vec3 c8 = s6.xyz;
float x = worldNormal.x, y = worldNormal.y, z = worldNormal.z;
vec3 result = c0 * 0.886227;
result += c1 * 2.0 * 0.511664 * y;
result += c2 * 2.0 * 0.511664 * z;
result += c3 * 2.0 * 0.511664 * x;
result += c4 * 2.0 * 0.429043 * x * y;
result += c5 * 2.0 * 0.429043 * y * z;
result += c6 * ( 0.743125 * z * z - 0.247708 );
result += c7 * 2.0 * 0.429043 * x * z;
result += c8 * 0.429043 * ( x * x - y * y );
return max( result, vec3( 0.0 ) );
}
#endif
`;var ph=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif
`;var mh=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
uniform float logDepthBufFC;
varying float vFragDepth;
varying float vIsPerspective;
#endif
`;var gh=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
varying float vFragDepth;
varying float vIsPerspective;
#endif
`;var _h=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
vFragDepth = 1.0 + gl_Position.w;
vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif
`;var xh=`#ifdef USE_MAP
vec4 sampledDiffuseColor = texture2D( map, vMapUv );
#ifdef DECODE_VIDEO_TEXTURE
sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
#endif
diffuseColor *= sampledDiffuseColor;
#endif
`;var Mh=`#ifdef USE_MAP
uniform sampler2D map;
#endif
`;var vh=`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
#if defined( USE_POINTS_UV )
vec2 uv = vUv;
#else
vec2 uv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;
#endif
#endif
#ifdef USE_MAP
diffuseColor *= texture2D( map, uv );
#endif
#ifdef USE_ALPHAMAP
diffuseColor.a *= texture2D( alphaMap, uv ).g;
#endif
`;var Sh=`#if defined( USE_POINTS_UV )
varying vec2 vUv;
#else
#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
uniform mat3 uvTransform;
#endif
#endif
#ifdef USE_MAP
uniform sampler2D map;
#endif
#ifdef USE_ALPHAMAP
uniform sampler2D alphaMap;
#endif
`;var yh=`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
metalnessFactor *= texelMetalness.b;
#endif
`;var Eh=`#ifdef USE_METALNESSMAP
uniform sampler2D metalnessMap;
#endif
`;var bh=`#ifdef USE_INSTANCING_MORPH
float morphTargetInfluences[ MORPHTARGETS_COUNT ];
float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
morphTargetInfluences[i] = texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
}
#endif
`;var Th=`#if defined( USE_MORPHCOLORS )
vColor *= morphTargetBaseInfluence;
for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
#if defined( USE_COLOR_ALPHA )
if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
#elif defined( USE_COLOR )
if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
#endif
}
#endif
`;var Ah=`#ifdef USE_MORPHNORMALS
objectNormal *= morphTargetBaseInfluence;
for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
}
#endif
`;var wh=`#ifdef USE_MORPHTARGETS
#ifndef USE_INSTANCING_MORPH
uniform float morphTargetBaseInfluence;
uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];
#endif
uniform sampler2DArray morphTargetsTexture;
uniform ivec2 morphTargetsTextureSize;
vec4 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset ) {
int texelIndex = vertexIndex * MORPHTARGETS_TEXTURE_STRIDE + offset;
int y = texelIndex / morphTargetsTextureSize.x;
int x = texelIndex - y * morphTargetsTextureSize.x;
ivec3 morphUV = ivec3( x, y, morphTargetIndex );
return texelFetch( morphTargetsTexture, morphUV, 0 );
}
#endif
`;var Rh=`#ifdef USE_MORPHTARGETS
transformed *= morphTargetBaseInfluence;
for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
}
#endif
`;var Ch=`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
#ifdef FLAT_SHADED
vec3 fdx = dFdx( vViewPosition );
vec3 fdy = dFdy( vViewPosition );
vec3 normal = normalize( cross( fdx, fdy ) );
#else
vec3 normal = normalize( vNormal );
#ifdef DOUBLE_SIDED
normal *= faceDirection;
#endif
#endif
#if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY )
#ifdef USE_TANGENT
mat3 tbn = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
#else
mat3 tbn = getTangentFrame( - vViewPosition, normal,
#if defined( USE_NORMALMAP )
vNormalMapUv
#elif defined( USE_CLEARCOAT_NORMALMAP )
vClearcoatNormalMapUv
#else
vUv
#endif
);
#endif
#ifdef DOUBLE_SIDED
tbn[0] *= faceDirection;
tbn[1] *= faceDirection;
#endif
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
#ifdef USE_TANGENT
mat3 tbn2 = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
#else
mat3 tbn2 = getTangentFrame( - vViewPosition, normal, vClearcoatNormalMapUv );
#endif
#ifdef DOUBLE_SIDED
tbn2[0] *= faceDirection;
tbn2[1] *= faceDirection;
#endif
#endif
vec3 nonPerturbedNormal = normal;
`;var Ph=`#ifdef USE_NORMALMAP_OBJECTSPACE
normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
#ifdef FLIP_SIDED
normal = - normal;
#endif
#ifdef DOUBLE_SIDED
normal = normal * faceDirection;
#endif
normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
#if defined( USE_PACKED_NORMALMAP )
mapN = vec3( mapN.xy, sqrt( saturate( 1.0 - dot( mapN.xy, mapN.xy ) ) ) );
#endif
mapN.xy *= normalScale;
normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif
`;var Lh=`#ifndef FLAT_SHADED
varying vec3 vNormal;
#ifdef USE_TANGENT
varying vec3 vTangent;
varying vec3 vBitangent;
#endif
#endif
`;var Dh=`#ifndef FLAT_SHADED
varying vec3 vNormal;
#ifdef USE_TANGENT
varying vec3 vTangent;
varying vec3 vBitangent;
#endif
#endif
`;var Ih=`#ifndef FLAT_SHADED
vNormal = normalize( transformedNormal );
#ifdef USE_TANGENT
vTangent = normalize( transformedTangent );
vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
#ifdef FLIP_SIDED
vBitangent = - vBitangent;
#endif
#endif
#endif
`;var Fh=`#ifdef USE_NORMALMAP
uniform sampler2D normalMap;
uniform vec2 normalScale;
#endif
#ifdef USE_NORMALMAP_OBJECTSPACE
uniform mat3 normalMatrix;
#endif
#if ! defined ( USE_TANGENT ) && ( defined ( USE_NORMALMAP_TANGENTSPACE ) || defined ( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY ) )
mat3 getTangentFrame( vec3 eye_pos, vec3 surf_norm, vec2 uv ) {
vec3 q0 = dFdx( eye_pos.xyz );
vec3 q1 = dFdy( eye_pos.xyz );
vec2 st0 = dFdx( uv.st );
vec2 st1 = dFdy( uv.st );
vec3 N = surf_norm;
vec3 q1perp = cross( q1, N );
vec3 q0perp = cross( N, q0 );
vec3 T = q1perp * st0.x + q0perp * st1.x;
vec3 B = q1perp * st0.y + q0perp * st1.y;
float det = max( dot( T, T ), dot( B, B ) );
float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
return mat3( T * scale, B * scale, N );
}
#endif
`;var Uh=`#ifdef USE_CLEARCOAT
vec3 clearcoatNormal = nonPerturbedNormal;
#endif
`;var Nh=`#ifdef USE_CLEARCOAT_NORMALMAP
vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
clearcoatMapN.xy *= clearcoatNormalScale;
clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif
`;var Oh=`#ifdef USE_CLEARCOATMAP
uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
uniform sampler2D clearcoatNormalMap;
uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
uniform sampler2D clearcoatRoughnessMap;
#endif
`;var Bh=`#ifdef USE_IRIDESCENCEMAP
uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
uniform sampler2D iridescenceThicknessMap;
#endif
`;var Gh=`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );
`;var zh=`vec3 packNormalToRGB( const in vec3 normal ) {
return normalize( normal ) * 0.5 + 0.5;
}
vec3 unpackRGBToNormal( const in vec3 rgb ) {
return 2.0 * rgb.xyz - 1.0;
}
const float PackUpscale = 256. / 255.;
const float UnpackDownscale = 255. / 256.;
const float ShiftRight8 = 1. / 256.;
const float Inv255 = 1. / 255.;
const vec4 PackFactors = vec4( 1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0 );
const vec2 UnpackFactors2 = vec2( UnpackDownscale, 1.0 / PackFactors.g );
const vec3 UnpackFactors3 = vec3( UnpackDownscale / PackFactors.rg, 1.0 / PackFactors.b );
const vec4 UnpackFactors4 = vec4( UnpackDownscale / PackFactors.rgb, 1.0 / PackFactors.a );
vec4 packDepthToRGBA( const in float v ) {
if( v <= 0.0 )
return vec4( 0., 0., 0., 0. );
if( v >= 1.0 )
return vec4( 1., 1., 1., 1. );
float vuf;
float af = modf( v * PackFactors.a, vuf );
float bf = modf( vuf * ShiftRight8, vuf );
float gf = modf( vuf * ShiftRight8, vuf );
return vec4( vuf * Inv255, gf * PackUpscale, bf * PackUpscale, af );
}
vec3 packDepthToRGB( const in float v ) {
if( v <= 0.0 )
return vec3( 0., 0., 0. );
if( v >= 1.0 )
return vec3( 1., 1., 1. );
float vuf;
float bf = modf( v * PackFactors.b, vuf );
float gf = modf( vuf * ShiftRight8, vuf );
return vec3( vuf * Inv255, gf * PackUpscale, bf );
}
vec2 packDepthToRG( const in float v ) {
if( v <= 0.0 )
return vec2( 0., 0. );
if( v >= 1.0 )
return vec2( 1., 1. );
float vuf;
float gf = modf( v * 256., vuf );
return vec2( vuf * Inv255, gf );
}
float unpackRGBAToDepth( const in vec4 v ) {
return dot( v, UnpackFactors4 );
}
float unpackRGBToDepth( const in vec3 v ) {
return dot( v, UnpackFactors3 );
}
float unpackRGToDepth( const in vec2 v ) {
return v.r * UnpackFactors2.r + v.g * UnpackFactors2.g;
}
vec4 pack2HalfToRGBA( const in vec2 v ) {
vec4 r = vec4( v.x, fract( v.x * 255.0 ), v.y, fract( v.y * 255.0 ) );
return vec4( r.x - r.y / 255.0, r.y, r.z - r.w / 255.0, r.w );
}
vec2 unpackRGBATo2Half( const in vec4 v ) {
return vec2( v.x + ( v.y / 255.0 ), v.z + ( v.w / 255.0 ) );
}
float viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {
return ( viewZ + near ) / ( near - far );
}
float orthographicDepthToViewZ( const in float depth, const in float near, const in float far ) {
#ifdef USE_REVERSED_DEPTH_BUFFER
return depth * ( far - near ) - far;
#else
return depth * ( near - far ) - near;
#endif
}
float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {
return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );
}
float perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {
#ifdef USE_REVERSED_DEPTH_BUFFER
return ( near * far ) / ( ( near - far ) * depth - near );
#else
return ( near * far ) / ( ( far - near ) * depth - far );
#endif
}
`;var Vh=`#ifdef PREMULTIPLIED_ALPHA
gl_FragColor.rgb *= gl_FragColor.a;
#endif
`;var Hh=`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;
`;var kh=`#ifdef DITHERING
gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif
`;var Wh=`#ifdef DITHERING
vec3 dithering( vec3 color ) {
float grid_position = rand( gl_FragCoord.xy );
vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
return color + dither_shift_RGB;
}
#endif
`;var Xh=`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
roughnessFactor *= texelRoughness.g;
#endif
`;var qh=`#ifdef USE_ROUGHNESSMAP
uniform sampler2D roughnessMap;
#endif
`;var Yh=`#if NUM_SPOT_LIGHT_COORDS > 0
varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#if NUM_SPOT_LIGHT_MAPS > 0
uniform sampler2D spotLightMap[ NUM_SPOT_LIGHT_MAPS ];
#endif
#ifdef USE_SHADOWMAP
#if NUM_SUN_LIGHT_SHADOWS > 0
#define SUN_LIGHT_CASCADES 2
#if defined( SHADOWMAP_TYPE_PCF )
uniform sampler2DShadow sunShadowMap[ NUM_SUN_LIGHT_SHADOWS ];
#else
uniform sampler2D sunShadowMap[ NUM_SUN_LIGHT_SHADOWS ];
#endif
uniform mat4 sunShadowMatrix[ NUM_SUN_LIGHT_SHADOWS * SUN_LIGHT_CASCADES ];
uniform vec4 sunShadowCascade[ NUM_SUN_LIGHT_SHADOWS * SUN_LIGHT_CASCADES ];
varying vec4 vSunShadowWorldPosition;
varying vec3 vSunShadowWorldNormal;
struct SunLightShadow {
float shadowIntensity;
float shadowBias;
float shadowNormalBias;
float shadowRadius;
vec2 shadowMapSize;
};
uniform SunLightShadow sunLightShadows[ NUM_SUN_LIGHT_SHADOWS ];
#endif
#if NUM_DIR_LIGHT_SHADOWS > 0
#if defined( SHADOWMAP_TYPE_PCF )
uniform sampler2DShadow directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
#else
uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
#endif
varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
struct DirectionalLightShadow {
float shadowIntensity;
float shadowBias;
float shadowNormalBias;
float shadowRadius;
vec2 shadowMapSize;
};
uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
#endif
#if NUM_SPOT_LIGHT_SHADOWS > 0
#if defined( SHADOWMAP_TYPE_PCF )
uniform sampler2DShadow spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
#else
uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
#endif
struct SpotLightShadow {
float shadowIntensity;
float shadowBias;
float shadowNormalBias;
float shadowRadius;
vec2 shadowMapSize;
};
uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
#endif
#if NUM_POINT_LIGHT_SHADOWS > 0
#if defined( SHADOWMAP_TYPE_PCF )
uniform samplerCubeShadow pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
#elif defined( SHADOWMAP_TYPE_BASIC )
uniform samplerCube pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
#endif
varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
struct PointLightShadow {
float shadowIntensity;
float shadowBias;
float shadowNormalBias;
float shadowRadius;
vec2 shadowMapSize;
float shadowCameraNear;
float shadowCameraFar;
};
uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
#endif
#if defined( SHADOWMAP_TYPE_PCF )
float interleavedGradientNoise( vec2 position ) {
return fract( 52.9829189 * fract( dot( position, vec2( 0.06711056, 0.00583715 ) ) ) );
}
vec2 vogelDiskSample( int sampleIndex, int samplesCount, float phi ) {
const float goldenAngle = 2.399963229728653;
float r = sqrt( ( float( sampleIndex ) + 0.5 ) / float( samplesCount ) );
float theta = float( sampleIndex ) * goldenAngle + phi;
return vec2( cos( theta ), sin( theta ) ) * r;
}
#endif
#if defined( SHADOWMAP_TYPE_PCF )
float getShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
float shadow = 1.0;
shadowCoord.xyz /= shadowCoord.w;
shadowCoord.z += shadowBias;
bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
if ( frustumTest ) {
vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
float radius = shadowRadius * texelSize.x;
float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
shadow = (
texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 0, 5, phi ) * radius, shadowCoord.z ) ) +
texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 1, 5, phi ) * radius, shadowCoord.z ) ) +
texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 2, 5, phi ) * radius, shadowCoord.z ) ) +
texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 3, 5, phi ) * radius, shadowCoord.z ) ) +
texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 4, 5, phi ) * radius, shadowCoord.z ) )
) * 0.2;
}
return mix( 1.0, shadow, shadowIntensity );
}
#elif defined( SHADOWMAP_TYPE_VSM )
float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
float shadow = 1.0;
shadowCoord.xyz /= shadowCoord.w;
#ifdef USE_REVERSED_DEPTH_BUFFER
shadowCoord.z -= shadowBias;
#else
shadowCoord.z += shadowBias;
#endif
bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
if ( frustumTest ) {
vec2 distribution = texture2D( shadowMap, shadowCoord.xy ).rg;
float mean = distribution.x;
float variance = distribution.y * distribution.y;
#ifdef USE_REVERSED_DEPTH_BUFFER
float hard_shadow = step( mean, shadowCoord.z );
#else
float hard_shadow = step( shadowCoord.z, mean );
#endif
if ( hard_shadow == 1.0 ) {
shadow = 1.0;
} else {
variance = max( variance, 0.0000001 );
float d = shadowCoord.z - mean;
float p_max = variance / ( variance + d * d );
p_max = clamp( ( p_max - 0.3 ) / 0.65, 0.0, 1.0 );
shadow = max( hard_shadow, p_max );
}
}
return mix( 1.0, shadow, shadowIntensity );
}
#else
float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
float shadow = 1.0;
shadowCoord.xyz /= shadowCoord.w;
#ifdef USE_REVERSED_DEPTH_BUFFER
shadowCoord.z -= shadowBias;
#else
shadowCoord.z += shadowBias;
#endif
bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
if ( frustumTest ) {
float depth = texture2D( shadowMap, shadowCoord.xy ).r;
#ifdef USE_REVERSED_DEPTH_BUFFER
shadow = step( depth, shadowCoord.z );
#else
shadow = step( shadowCoord.z, depth );
#endif
}
return mix( 1.0, shadow, shadowIntensity );
}
#endif
#if NUM_SUN_LIGHT_SHADOWS > 0
float getSunShadow(
#if defined( SHADOWMAP_TYPE_PCF )
sampler2DShadow shadowMap,
#else
sampler2D shadowMap,
#endif
SunLightShadow sunLightShadow,
int shadowIndex
) {
vec4 shadowWorldPosition = vec4( vSunShadowWorldPosition.xyz + vSunShadowWorldNormal * sunLightShadow.shadowNormalBias, 1.0 );
float viewDepth = vSunShadowWorldPosition.w;
int cascadeOffset = shadowIndex * SUN_LIGHT_CASCADES;
float shadow = 1.0;
for ( int i = SUN_LIGHT_CASCADES - 1; i >= 0; i -- ) {
vec4 cascade = sunShadowCascade[ cascadeOffset + i ];
if ( viewDepth >= cascade.x && viewDepth < cascade.y ) {
float cascadeShadow = getShadow(
shadowMap,
sunLightShadow.shadowMapSize,
sunLightShadow.shadowIntensity,
sunLightShadow.shadowBias,
sunLightShadow.shadowRadius,
sunShadowMatrix[ cascadeOffset + i ] * shadowWorldPosition
);
shadow = mix( cascadeShadow, shadow, smoothstep( cascade.z, cascade.y, viewDepth ) );
}
}
return shadow;
}
#endif
#if NUM_POINT_LIGHT_SHADOWS > 0
#if defined( SHADOWMAP_TYPE_PCF )
float getPointShadow( samplerCubeShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
float shadow = 1.0;
vec3 lightToPosition = shadowCoord.xyz;
vec3 bd3D = normalize( lightToPosition );
vec3 absVec = abs( lightToPosition );
float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
#ifdef USE_REVERSED_DEPTH_BUFFER
float dp = ( shadowCameraNear * ( shadowCameraFar - viewSpaceZ ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
dp -= shadowBias;
#else
float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
dp += shadowBias;
#endif
float texelSize = shadowRadius / shadowMapSize.x;
vec3 absDir = abs( bd3D );
vec3 tangent = absDir.x > absDir.z ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 );
tangent = normalize( cross( bd3D, tangent ) );
vec3 bitangent = cross( bd3D, tangent );
float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
vec2 sample0 = vogelDiskSample( 0, 5, phi );
vec2 sample1 = vogelDiskSample( 1, 5, phi );
vec2 sample2 = vogelDiskSample( 2, 5, phi );
vec2 sample3 = vogelDiskSample( 3, 5, phi );
vec2 sample4 = vogelDiskSample( 4, 5, phi );
shadow = (
texture( shadowMap, vec4( bd3D + ( tangent * sample0.x + bitangent * sample0.y ) * texelSize, dp ) ) +
texture( shadowMap, vec4( bd3D + ( tangent * sample1.x + bitangent * sample1.y ) * texelSize, dp ) ) +
texture( shadowMap, vec4( bd3D + ( tangent * sample2.x + bitangent * sample2.y ) * texelSize, dp ) ) +
texture( shadowMap, vec4( bd3D + ( tangent * sample3.x + bitangent * sample3.y ) * texelSize, dp ) ) +
texture( shadowMap, vec4( bd3D + ( tangent * sample4.x + bitangent * sample4.y ) * texelSize, dp ) )
) * 0.2;
}
return mix( 1.0, shadow, shadowIntensity );
}
#elif defined( SHADOWMAP_TYPE_BASIC )
float getPointShadow( samplerCube shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
float shadow = 1.0;
vec3 lightToPosition = shadowCoord.xyz;
vec3 absVec = abs( lightToPosition );
float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
dp += shadowBias;
vec3 bd3D = normalize( lightToPosition );
float depth = textureCube( shadowMap, bd3D ).r;
#ifdef USE_REVERSED_DEPTH_BUFFER
depth = 1.0 - depth;
#endif
shadow = step( dp, depth );
}
return mix( 1.0, shadow, shadowIntensity );
}
#endif
#endif
#endif
`;var Zh=`#if NUM_SPOT_LIGHT_COORDS > 0
uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];
varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#ifdef USE_SHADOWMAP
#if NUM_SUN_LIGHT_SHADOWS > 0
varying vec4 vSunShadowWorldPosition;
varying vec3 vSunShadowWorldNormal;
#endif
#if NUM_DIR_LIGHT_SHADOWS > 0
uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
struct DirectionalLightShadow {
float shadowIntensity;
float shadowBias;
float shadowNormalBias;
float shadowRadius;
vec2 shadowMapSize;
};
uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
#endif
#if NUM_SPOT_LIGHT_SHADOWS > 0
struct SpotLightShadow {
float shadowIntensity;
float shadowBias;
float shadowNormalBias;
float shadowRadius;
vec2 shadowMapSize;
};
uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
#endif
#if NUM_POINT_LIGHT_SHADOWS > 0
uniform mat4 pointShadowMatrix[ NUM_POINT_LIGHT_SHADOWS ];
varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
struct PointLightShadow {
float shadowIntensity;
float shadowBias;
float shadowNormalBias;
float shadowRadius;
vec2 shadowMapSize;
float shadowCameraNear;
float shadowCameraFar;
};
uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
#endif
#endif
`;var Kh=`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_SUN_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
#ifdef HAS_NORMAL
vec3 shadowWorldNormal = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );
#else
vec3 shadowWorldNormal = vec3( 0.0 );
#endif
vec4 shadowWorldPosition;
#endif
#if defined( USE_SHADOWMAP )
#if NUM_SUN_LIGHT_SHADOWS > 0
vSunShadowWorldPosition = vec4( worldPosition.xyz, - mvPosition.z );
vSunShadowWorldNormal = shadowWorldNormal;
#endif
#if NUM_DIR_LIGHT_SHADOWS > 0
#pragma unroll_loop_start
for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );
vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;
}
#pragma unroll_loop_end
#endif
#if NUM_POINT_LIGHT_SHADOWS > 0
#pragma unroll_loop_start
for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * pointLightShadows[ i ].shadowNormalBias, 0 );
vPointShadowCoord[ i ] = pointShadowMatrix[ i ] * shadowWorldPosition;
}
#pragma unroll_loop_end
#endif
#endif
#if NUM_SPOT_LIGHT_COORDS > 0
#pragma unroll_loop_start
for ( int i = 0; i < NUM_SPOT_LIGHT_COORDS; i ++ ) {
shadowWorldPosition = worldPosition;
#if ( defined( USE_SHADOWMAP ) && UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
shadowWorldPosition.xyz += shadowWorldNormal * spotLightShadows[ i ].shadowNormalBias;
#endif
vSpotLightCoord[ i ] = spotLightMatrix[ i ] * shadowWorldPosition;
}
#pragma unroll_loop_end
#endif
`;var Jh=`float getShadowMask() {
float shadow = 1.0;
#ifdef USE_SHADOWMAP
#if NUM_SUN_LIGHT_SHADOWS > 0
SunLightShadow sunLight;
#pragma unroll_loop_start
for ( int i = 0; i < NUM_SUN_LIGHT_SHADOWS; i ++ ) {
sunLight = sunLightShadows[ i ];
shadow *= receiveShadow ? getSunShadow( sunShadowMap[ i ], sunLight, UNROLLED_LOOP_INDEX ) : 1.0;
}
#pragma unroll_loop_end
#endif
#if NUM_DIR_LIGHT_SHADOWS > 0
DirectionalLightShadow directionalLight;
#pragma unroll_loop_start
for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
directionalLight = directionalLightShadows[ i ];
shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowIntensity, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
}
#pragma unroll_loop_end
#endif
#if NUM_SPOT_LIGHT_SHADOWS > 0
SpotLightShadow spotLight;
#pragma unroll_loop_start
for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {
spotLight = spotLightShadows[ i ];
shadow *= receiveShadow ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowIntensity, spotLight.shadowBias, spotLight.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
}
#pragma unroll_loop_end
#endif
#if NUM_POINT_LIGHT_SHADOWS > 0 && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
PointLightShadow pointLight;
#pragma unroll_loop_start
for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
pointLight = pointLightShadows[ i ];
shadow *= receiveShadow ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowIntensity, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;
}
#pragma unroll_loop_end
#endif
#endif
return shadow;
}
`;var $h=`#ifdef USE_SKINNING
mat4 boneMatX = getBoneMatrix( skinIndex.x );
mat4 boneMatY = getBoneMatrix( skinIndex.y );
mat4 boneMatZ = getBoneMatrix( skinIndex.z );
mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif
`;var Qh=`#ifdef USE_SKINNING
uniform mat4 bindMatrix;
uniform mat4 bindMatrixInverse;
uniform highp sampler2D boneTexture;
mat4 getBoneMatrix( const in float i ) {
int size = textureSize( boneTexture, 0 ).x;
int j = int( i ) * 4;
int x = j % size;
int y = j / size;
vec4 v1 = texelFetch( boneTexture, ivec2( x, y ), 0 );
vec4 v2 = texelFetch( boneTexture, ivec2( x + 1, y ), 0 );
vec4 v3 = texelFetch( boneTexture, ivec2( x + 2, y ), 0 );
vec4 v4 = texelFetch( boneTexture, ivec2( x + 3, y ), 0 );
return mat4( v1, v2, v3, v4 );
}
#endif
`;var jh=`#ifdef USE_SKINNING
vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
vec4 skinned = vec4( 0.0 );
skinned += boneMatX * skinVertex * skinWeight.x;
skinned += boneMatY * skinVertex * skinWeight.y;
skinned += boneMatZ * skinVertex * skinWeight.z;
skinned += boneMatW * skinVertex * skinWeight.w;
transformed = ( bindMatrixInverse * skinned ).xyz;
#endif
`;var ed=`#ifdef USE_SKINNING
mat4 skinMatrix = mat4( 0.0 );
skinMatrix += skinWeight.x * boneMatX;
skinMatrix += skinWeight.y * boneMatY;
skinMatrix += skinWeight.z * boneMatZ;
skinMatrix += skinWeight.w * boneMatW;
skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;
#ifdef USE_TANGENT
objectTangent = vec4( skinMatrix * vec4( objectTangent, 0.0 ) ).xyz;
#endif
#endif
`;var td=`float specularStrength;
#ifdef USE_SPECULARMAP
vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
specularStrength = texelSpecular.r;
#else
specularStrength = 1.0;
#endif
`;var id=`#ifdef USE_SPECULARMAP
uniform sampler2D specularMap;
#endif
`;var nd=`#if defined( TONE_MAPPING )
gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif
`;var rd=`#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
uniform float toneMappingExposure;
vec3 LinearToneMapping( vec3 color ) {
return saturate( toneMappingExposure * color );
}
vec3 ReinhardToneMapping( vec3 color ) {
color *= toneMappingExposure;
return saturate( color / ( vec3( 1.0 ) + color ) );
}
vec3 CineonToneMapping( vec3 color ) {
color *= toneMappingExposure;
color = max( vec3( 0.0 ), color - 0.004 );
return pow( ( color * ( 6.2 * color + 0.5 ) ) / ( color * ( 6.2 * color + 1.7 ) + 0.06 ), vec3( 2.2 ) );
}
vec3 RRTAndODTFit( vec3 v ) {
vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
return a / b;
}
vec3 ACESFilmicToneMapping( vec3 color ) {
const mat3 ACESInputMat = mat3(
vec3( 0.59719, 0.07600, 0.02840 ),
vec3( 0.35458, 0.90834, 0.13383 ),
vec3( 0.04823, 0.01566, 0.83777 )
);
const mat3 ACESOutputMat = mat3(
vec3( 1.60475, -0.10208, -0.00327 ),
vec3( -0.53108, 1.10813, -0.07276 ),
vec3( -0.07367, -0.00605, 1.07602 )
);
color *= toneMappingExposure / 0.6;
color = ACESInputMat * color;
color = RRTAndODTFit( color );
color = ACESOutputMat * color;
return saturate( color );
}
const mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(
vec3( 1.6605, - 0.1246, - 0.0182 ),
vec3( - 0.5876, 1.1329, - 0.1006 ),
vec3( - 0.0728, - 0.0083, 1.1187 )
);
const mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
vec3( 0.6274, 0.0691, 0.0164 ),
vec3( 0.3293, 0.9195, 0.0880 ),
vec3( 0.0433, 0.0113, 0.8956 )
);
vec3 agxDefaultContrastApprox( vec3 x ) {
vec3 x2 = x * x;
vec3 x4 = x2 * x2;
return + 15.5 * x4 * x2
- 40.14 * x4 * x
+ 31.96 * x4
- 6.868 * x2 * x
+ 0.4298 * x2
+ 0.1191 * x
- 0.00232;
}
vec3 AgXToneMapping( vec3 color ) {
const mat3 AgXInsetMatrix = mat3(
vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),
vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),
vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 )
);
const mat3 AgXOutsetMatrix = mat3(
vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ),
vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ),
vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 )
);
const float AgxMinEv = - 12.47393;
const float AgxMaxEv = 4.026069;
color *= toneMappingExposure;
color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;
color = AgXInsetMatrix * color;
color = max( color, 1e-10 );
color = log2( color );
color = ( color - AgxMinEv ) / ( AgxMaxEv - AgxMinEv );
color = clamp( color, 0.0, 1.0 );
color = agxDefaultContrastApprox( color );
color = AgXOutsetMatrix * color;
color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
color = LINEAR_REC2020_TO_LINEAR_SRGB * color;
color = clamp( color, 0.0, 1.0 );
return color;
}
vec3 NeutralToneMapping( vec3 color ) {
const float StartCompression = 0.8 - 0.04;
const float Desaturation = 0.15;
color *= toneMappingExposure;
float x = min( color.r, min( color.g, color.b ) );
float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
color -= offset;
float peak = max( color.r, max( color.g, color.b ) );
if ( peak < StartCompression ) return color;
float d = 1. - StartCompression;
float newPeak = 1. - d * d / ( peak + d - StartCompression );
color *= newPeak / peak;
float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
return mix( color, vec3( newPeak ), g );
}
vec3 CustomToneMapping( vec3 color ) { return color; }
`;var od=`#ifdef USE_TRANSMISSION
material.transmission = transmission;
material.transmissionAlpha = 1.0;
material.thickness = thickness;
material.attenuationDistance = attenuationDistance;
material.attenuationColor = attenuationColor;
#ifdef USE_TRANSMISSIONMAP
material.transmission *= texture2D( transmissionMap, vTransmissionMapUv ).r;
#endif
#ifdef USE_THICKNESSMAP
material.thickness *= texture2D( thicknessMap, vThicknessMapUv ).g;
#endif
vec3 pos = vWorldPosition;
vec3 v = normalize( cameraPosition - pos );
vec3 n = transformNormalByInverseViewMatrix( normal, viewMatrix );
vec4 transmitted = getIBLVolumeRefraction(
n, v, material.roughness, material.diffuseContribution, material.specularColorBlended, material.specularF90,
pos, modelMatrix, viewMatrix, projectionMatrix, material.dispersion, material.ior, material.thickness,
material.attenuationColor, material.attenuationDistance );
material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );
totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );
#endif
`;var sd=`#ifdef USE_TRANSMISSION
uniform float transmission;
uniform float thickness;
uniform float attenuationDistance;
uniform vec3 attenuationColor;
#ifdef USE_TRANSMISSIONMAP
uniform sampler2D transmissionMap;
#endif
#ifdef USE_THICKNESSMAP
uniform sampler2D thicknessMap;
#endif
uniform vec2 transmissionSamplerSize;
uniform sampler2D transmissionSamplerMap;
uniform mat4 modelMatrix;
uniform mat4 projectionMatrix;
varying vec3 vWorldPosition;
float w0( float a ) {
return ( 1.0 / 6.0 ) * ( a * ( a * ( - a + 3.0 ) - 3.0 ) + 1.0 );
}
float w1( float a ) {
return ( 1.0 / 6.0 ) * ( a * a * ( 3.0 * a - 6.0 ) + 4.0 );
}
float w2( float a ){
return ( 1.0 / 6.0 ) * ( a * ( a * ( - 3.0 * a + 3.0 ) + 3.0 ) + 1.0 );
}
float w3( float a ) {
return ( 1.0 / 6.0 ) * ( a * a * a );
}
float g0( float a ) {
return w0( a ) + w1( a );
}
float g1( float a ) {
return w2( a ) + w3( a );
}
float h0( float a ) {
return - 1.0 + w1( a ) / ( w0( a ) + w1( a ) );
}
float h1( float a ) {
return 1.0 + w3( a ) / ( w2( a ) + w3( a ) );
}
vec4 bicubic( sampler2D tex, vec2 uv, vec4 texelSize, float lod ) {
uv = uv * texelSize.zw + 0.5;
vec2 iuv = floor( uv );
vec2 fuv = fract( uv );
float g0x = g0( fuv.x );
float g1x = g1( fuv.x );
float h0x = h0( fuv.x );
float h1x = h1( fuv.x );
float h0y = h0( fuv.y );
float h1y = h1( fuv.y );
vec2 p0 = ( vec2( iuv.x + h0x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
vec2 p1 = ( vec2( iuv.x + h1x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
vec2 p2 = ( vec2( iuv.x + h0x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
vec2 p3 = ( vec2( iuv.x + h1x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
return g0( fuv.y ) * ( g0x * textureLod( tex, p0, lod ) + g1x * textureLod( tex, p1, lod ) ) +
g1( fuv.y ) * ( g0x * textureLod( tex, p2, lod ) + g1x * textureLod( tex, p3, lod ) );
}
vec4 textureBicubic( sampler2D sampler, vec2 uv, float lod ) {
vec2 fLodSize = vec2( textureSize( sampler, int( lod ) ) );
vec2 cLodSize = vec2( textureSize( sampler, int( lod + 1.0 ) ) );
vec2 fLodSizeInv = 1.0 / fLodSize;
vec2 cLodSizeInv = 1.0 / cLodSize;
vec4 fSample = bicubic( sampler, uv, vec4( fLodSizeInv, fLodSize ), floor( lod ) );
vec4 cSample = bicubic( sampler, uv, vec4( cLodSizeInv, cLodSize ), ceil( lod ) );
return mix( fSample, cSample, fract( lod ) );
}
vec3 getVolumeTransmissionRay( const in vec3 n, const in vec3 v, const in float thickness, const in float ior, const in mat4 modelMatrix ) {
vec3 refractionVector = refract( - v, normalize( n ), 1.0 / ior );
vec3 modelScale;
modelScale.x = length( vec3( modelMatrix[ 0 ].xyz ) );
modelScale.y = length( vec3( modelMatrix[ 1 ].xyz ) );
modelScale.z = length( vec3( modelMatrix[ 2 ].xyz ) );
return normalize( refractionVector ) * thickness * modelScale;
}
float applyIorToRoughness( const in float roughness, const in float ior ) {
return roughness * clamp( ior * 2.0 - 2.0, 0.0, 1.0 );
}
vec4 getTransmissionSample( const in vec2 fragCoord, const in float roughness, const in float ior ) {
float lod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( roughness, ior );
return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );
}
vec3 volumeAttenuation( const in float transmissionDistance, const in vec3 attenuationColor, const in float attenuationDistance ) {
if ( isinf( attenuationDistance ) ) {
return vec3( 1.0 );
} else {
vec3 attenuationCoefficient = -log( attenuationColor ) / attenuationDistance;
vec3 transmittance = exp( - attenuationCoefficient * transmissionDistance );
return transmittance;
}
}
vec4 getIBLVolumeRefraction( const in vec3 n, const in vec3 v, const in float roughness, const in vec3 diffuseColor,
const in vec3 specularColor, const in float specularF90, const in vec3 position, const in mat4 modelMatrix,
const in mat4 viewMatrix, const in mat4 projMatrix, const in float dispersion, const in float ior, const in float thickness,
const in vec3 attenuationColor, const in float attenuationDistance ) {
vec4 transmittedLight;
vec3 transmittance;
#ifdef USE_DISPERSION
float halfSpread = ( ior - 1.0 ) * 0.025 * dispersion;
vec3 iors = vec3( ior - halfSpread, ior, ior + halfSpread );
for ( int i = 0; i < 3; i ++ ) {
vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, iors[ i ], modelMatrix );
vec3 refractedRayExit = position + transmissionRay;
vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
vec2 refractionCoords = ndcPos.xy / ndcPos.w;
refractionCoords += 1.0;
refractionCoords /= 2.0;
vec4 transmissionSample = getTransmissionSample( refractionCoords, roughness, iors[ i ] );
transmittedLight[ i ] = transmissionSample[ i ];
transmittedLight.a += transmissionSample.a;
transmittance[ i ] = diffuseColor[ i ] * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance )[ i ];
}
transmittedLight.a /= 3.0;
#else
vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, ior, modelMatrix );
vec3 refractedRayExit = position + transmissionRay;
vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
vec2 refractionCoords = ndcPos.xy / ndcPos.w;
refractionCoords += 1.0;
refractionCoords /= 2.0;
transmittedLight = getTransmissionSample( refractionCoords, roughness, ior );
transmittance = diffuseColor * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance );
#endif
vec3 attenuatedColor = transmittance * transmittedLight.rgb;
vec3 F = EnvironmentBRDF( n, v, specularColor, specularF90, roughness );
float transmittanceFactor = ( transmittance.r + transmittance.g + transmittance.b ) / 3.0;
return vec4( ( 1.0 - F ) * attenuatedColor, 1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor );
}
#endif
`;var ad=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
varying vec2 vUv;
#endif
#ifdef USE_MAP
varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
varying vec2 vNormalMapUv;
#endif
#ifdef USE_EMISSIVEMAP
varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_SPECULARMAP
varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
uniform mat3 transmissionMapTransform;
varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
uniform mat3 thicknessMapTransform;
varying vec2 vThicknessMapUv;
#endif
`;var ld=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
varying vec2 vUv;
#endif
#ifdef USE_MAP
uniform mat3 mapTransform;
varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
uniform mat3 alphaMapTransform;
varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
uniform mat3 lightMapTransform;
varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
uniform mat3 aoMapTransform;
varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
uniform mat3 bumpMapTransform;
varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
uniform mat3 normalMapTransform;
varying vec2 vNormalMapUv;
#endif
#ifdef USE_DISPLACEMENTMAP
uniform mat3 displacementMapTransform;
varying vec2 vDisplacementMapUv;
#endif
#ifdef USE_EMISSIVEMAP
uniform mat3 emissiveMapTransform;
varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
uniform mat3 metalnessMapTransform;
varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
uniform mat3 roughnessMapTransform;
varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
uniform mat3 anisotropyMapTransform;
varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
uniform mat3 clearcoatMapTransform;
varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
uniform mat3 clearcoatNormalMapTransform;
varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
uniform mat3 clearcoatRoughnessMapTransform;
varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
uniform mat3 sheenColorMapTransform;
varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
uniform mat3 sheenRoughnessMapTransform;
varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
uniform mat3 iridescenceMapTransform;
varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
uniform mat3 iridescenceThicknessMapTransform;
varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SPECULARMAP
uniform mat3 specularMapTransform;
varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
uniform mat3 specularColorMapTransform;
varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
uniform mat3 specularIntensityMapTransform;
varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
uniform mat3 transmissionMapTransform;
varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
uniform mat3 thicknessMapTransform;
varying vec2 vThicknessMapUv;
#endif
`;var cd=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
vUv = vec3( uv, 1 ).xy;
#endif
#ifdef USE_MAP
vMapUv = ( mapTransform * vec3( MAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ALPHAMAP
vAlphaMapUv = ( alphaMapTransform * vec3( ALPHAMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_LIGHTMAP
vLightMapUv = ( lightMapTransform * vec3( LIGHTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_AOMAP
vAoMapUv = ( aoMapTransform * vec3( AOMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_BUMPMAP
vBumpMapUv = ( bumpMapTransform * vec3( BUMPMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_NORMALMAP
vNormalMapUv = ( normalMapTransform * vec3( NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_DISPLACEMENTMAP
vDisplacementMapUv = ( displacementMapTransform * vec3( DISPLACEMENTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_EMISSIVEMAP
vEmissiveMapUv = ( emissiveMapTransform * vec3( EMISSIVEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_METALNESSMAP
vMetalnessMapUv = ( metalnessMapTransform * vec3( METALNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ROUGHNESSMAP
vRoughnessMapUv = ( roughnessMapTransform * vec3( ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ANISOTROPYMAP
vAnisotropyMapUv = ( anisotropyMapTransform * vec3( ANISOTROPYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOATMAP
vClearcoatMapUv = ( clearcoatMapTransform * vec3( CLEARCOATMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
vClearcoatNormalMapUv = ( clearcoatNormalMapTransform * vec3( CLEARCOAT_NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
vClearcoatRoughnessMapUv = ( clearcoatRoughnessMapTransform * vec3( CLEARCOAT_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCEMAP
vIridescenceMapUv = ( iridescenceMapTransform * vec3( IRIDESCENCEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
vIridescenceThicknessMapUv = ( iridescenceThicknessMapTransform * vec3( IRIDESCENCE_THICKNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_COLORMAP
vSheenColorMapUv = ( sheenColorMapTransform * vec3( SHEEN_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
vSheenRoughnessMapUv = ( sheenRoughnessMapTransform * vec3( SHEEN_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULARMAP
vSpecularMapUv = ( specularMapTransform * vec3( SPECULARMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_COLORMAP
vSpecularColorMapUv = ( specularColorMapTransform * vec3( SPECULAR_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
vSpecularIntensityMapUv = ( specularIntensityMapTransform * vec3( SPECULAR_INTENSITYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_TRANSMISSIONMAP
vTransmissionMapUv = ( transmissionMapTransform * vec3( TRANSMISSIONMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_THICKNESSMAP
vThicknessMapUv = ( thicknessMapTransform * vec3( THICKNESSMAP_UV, 1 ) ).xy;
#endif
`;var fd=`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
vec4 worldPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
worldPosition = batchingMatrix * worldPosition;
#endif
#ifdef USE_INSTANCING
worldPosition = instanceMatrix * worldPosition;
#endif
worldPosition = modelMatrix * worldPosition;
#endif
`;var ud=`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
gl_Position = vec4( position.xy, 1.0, 1.0 );
}
`,hd=`uniform sampler2D t2D;
uniform float backgroundIntensity;
varying vec2 vUv;
void main() {
vec4 texColor = texture2D( t2D, vUv );
#ifdef DECODE_VIDEO_TEXTURE
texColor = vec4( mix( pow( texColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), texColor.rgb * 0.0773993808, vec3( lessThanEqual( texColor.rgb, vec3( 0.04045 ) ) ) ), texColor.w );
#endif
texColor.rgb *= backgroundIntensity;
gl_FragColor = texColor;
#include <tonemapping_fragment>
#include <colorspace_fragment>
}
`;var dd=`varying vec3 vWorldDirection;
#include <common>
void main() {
vWorldDirection = transformDirection( position, modelMatrix );
#include <begin_vertex>
#include <project_vertex>
gl_Position.z = gl_Position.w;
}
`,pd=`#ifdef ENVMAP_TYPE_CUBE
uniform samplerCube envMap;
#elif defined( ENVMAP_TYPE_CUBE_UV )
uniform sampler2D envMap;
#endif
uniform float backgroundBlurriness;
uniform float backgroundIntensity;
uniform mat3 backgroundRotation;
varying vec3 vWorldDirection;
#include <cube_uv_reflection_fragment>
void main() {
#ifdef ENVMAP_TYPE_CUBE
vec4 texColor = textureCube( envMap, backgroundRotation * vWorldDirection );
#elif defined( ENVMAP_TYPE_CUBE_UV )
vec4 texColor = textureCubeUV( envMap, backgroundRotation * vWorldDirection, backgroundBlurriness );
#else
vec4 texColor = vec4( 0.0, 0.0, 0.0, 1.0 );
#endif
texColor.rgb *= backgroundIntensity;
gl_FragColor = texColor;
#include <tonemapping_fragment>
#include <colorspace_fragment>
}
`;var md=`varying vec3 vWorldDirection;
#include <common>
void main() {
vWorldDirection = transformDirection( position, modelMatrix );
#include <begin_vertex>
#include <project_vertex>
gl_Position.z = gl_Position.w;
}
`,gd=`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
gl_FragColor = texColor;
gl_FragColor.a *= opacity;
#include <tonemapping_fragment>
#include <colorspace_fragment>
}
`;var _d=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec2 vHighPrecisionZW;
void main() {
#include <uv_vertex>
#include <batching_vertex>
#include <skinbase_vertex>
#include <morphinstance_vertex>
#ifdef USE_DISPLACEMENTMAP
#include <beginnormal_vertex>
#include <morphnormal_vertex>
#include <skinnormal_vertex>
#endif
#include <begin_vertex>
#include <morphtarget_vertex>
#include <skinning_vertex>
#include <displacementmap_vertex>
#include <project_vertex>
#include <logdepthbuf_vertex>
#include <clipping_planes_vertex>
vHighPrecisionZW = gl_Position.zw;
}
`,xd=`#if DEPTH_PACKING == 3200
uniform float opacity;
#endif
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
varying vec2 vHighPrecisionZW;
void main() {
vec4 diffuseColor = vec4( 1.0 );
#include <clipping_planes_fragment>
#if DEPTH_PACKING == 3200
diffuseColor.a = opacity;
#endif
#include <map_fragment>
#include <alphamap_fragment>
#include <alphatest_fragment>
#include <alphahash_fragment>
#include <logdepthbuf_fragment>
#ifdef USE_REVERSED_DEPTH_BUFFER
float fragCoordZ = vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ];
#else
float fragCoordZ = 0.5 * vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ] + 0.5;
#endif
#if DEPTH_PACKING == 3200
gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );
#elif DEPTH_PACKING == 3201
gl_FragColor = packDepthToRGBA( fragCoordZ );
#elif DEPTH_PACKING == 3202
gl_FragColor = vec4( packDepthToRGB( fragCoordZ ), 1.0 );
#elif DEPTH_PACKING == 3203
gl_FragColor = vec4( packDepthToRG( fragCoordZ ), 0.0, 1.0 );
#endif
}
`;var Md=`#define DISTANCE
varying vec3 vWorldPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
#include <uv_vertex>
#include <batching_vertex>
#include <skinbase_vertex>
#include <morphinstance_vertex>
#ifdef USE_DISPLACEMENTMAP
#include <beginnormal_vertex>
#include <morphnormal_vertex>
#include <skinnormal_vertex>
#endif
#include <begin_vertex>
#include <morphtarget_vertex>
#include <skinning_vertex>
#include <displacementmap_vertex>
#include <project_vertex>
#include <worldpos_vertex>
#include <clipping_planes_vertex>
vWorldPosition = worldPosition.xyz;
}
`,vd=`#define DISTANCE
uniform vec3 referencePosition;
uniform float nearDistance;
uniform float farDistance;
varying vec3 vWorldPosition;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
vec4 diffuseColor = vec4( 1.0 );
#include <clipping_planes_fragment>
#include <map_fragment>
#include <alphamap_fragment>
#include <alphatest_fragment>
#include <alphahash_fragment>
float dist = length( vWorldPosition - referencePosition );
dist = ( dist - nearDistance ) / ( farDistance - nearDistance );
dist = saturate( dist );
gl_FragColor = vec4( dist, 0.0, 0.0, 1.0 );
}
`;var Sd=`varying vec3 vWorldDirection;
#include <common>
void main() {
vWorldDirection = transformDirection( position, modelMatrix );
#include <begin_vertex>
#include <project_vertex>
}
`,yd=`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
vec3 direction = normalize( vWorldDirection );
vec2 sampleUV = equirectUv( direction );
gl_FragColor = texture2D( tEquirect, sampleUV );
#include <tonemapping_fragment>
#include <colorspace_fragment>
}
`;var Ed=`uniform float scale;
attribute float lineDistance;
varying float vLineDistance;
#include <common>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
vLineDistance = scale * lineDistance;
#include <uv_vertex>
#include <color_vertex>
#include <morphinstance_vertex>
#include <morphcolor_vertex>
#include <begin_vertex>
#include <morphtarget_vertex>
#include <project_vertex>
#include <logdepthbuf_vertex>
#include <clipping_planes_vertex>
#include <fog_vertex>
}
`,bd=`uniform vec3 diffuse;
uniform float opacity;
uniform float dashSize;
uniform float totalSize;
varying float vLineDistance;
#include <common>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
vec4 diffuseColor = vec4( diffuse, opacity );
#include <clipping_planes_fragment>
if ( mod( vLineDistance, totalSize ) > dashSize ) {
discard;
}
vec3 outgoingLight = vec3( 0.0 );
#include <logdepthbuf_fragment>
#include <map_fragment>
#include <color_fragment>
outgoingLight = diffuseColor.rgb;
#include <opaque_fragment>
#include <tonemapping_fragment>
#include <colorspace_fragment>
#include <fog_fragment>
#include <premultiplied_alpha_fragment>
}
`;var Td=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
#include <uv_vertex>
#include <color_vertex>
#include <morphinstance_vertex>
#include <morphcolor_vertex>
#include <batching_vertex>
#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )
#include <beginnormal_vertex>
#include <morphnormal_vertex>
#include <skinbase_vertex>
#include <skinnormal_vertex>
#include <defaultnormal_vertex>
#endif
#include <begin_vertex>
#include <morphtarget_vertex>
#include <skinning_vertex>
#include <project_vertex>
#include <logdepthbuf_vertex>
#include <clipping_planes_vertex>
#include <worldpos_vertex>
#include <envmap_vertex>
#include <fog_vertex>
}
`,Ad=`uniform vec3 diffuse;
uniform float opacity;
#ifndef FLAT_SHADED
varying vec3 vNormal;
#endif
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
vec4 diffuseColor = vec4( diffuse, opacity );
#include <clipping_planes_fragment>
#include <logdepthbuf_fragment>
#include <map_fragment>
#include <color_fragment>
#include <alphamap_fragment>
#include <alphatest_fragment>
#include <alphahash_fragment>
#include <specularmap_fragment>
ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
#ifdef USE_LIGHTMAP
vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;
#else
reflectedLight.indirectDiffuse += vec3( 1.0 );
#endif
#include <aomap_fragment>
reflectedLight.indirectDiffuse *= diffuseColor.rgb;
vec3 outgoingLight = reflectedLight.indirectDiffuse;
#include <envmap_fragment>
#include <opaque_fragment>
#include <tonemapping_fragment>
#include <colorspace_fragment>
#include <fog_fragment>
#include <premultiplied_alpha_fragment>
#include <dithering_fragment>
}
`;var wd=`#define LAMBERT
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
#include <uv_vertex>
#include <color_vertex>
#include <morphinstance_vertex>
#include <morphcolor_vertex>
#include <batching_vertex>
#include <beginnormal_vertex>
#include <morphnormal_vertex>
#include <skinbase_vertex>
#include <skinnormal_vertex>
#include <defaultnormal_vertex>
#include <normal_vertex>
#include <begin_vertex>
#include <morphtarget_vertex>
#include <skinning_vertex>
#include <displacementmap_vertex>
#include <project_vertex>
#include <logdepthbuf_vertex>
#include <clipping_planes_vertex>
vViewPosition = - mvPosition.xyz;
#include <worldpos_vertex>
#include <envmap_vertex>
#include <shadowmap_vertex>
#include <fog_vertex>
}
`,Rd=`#define LAMBERT
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_lambert_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
vec4 diffuseColor = vec4( diffuse, opacity );
#include <clipping_planes_fragment>
ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
vec3 totalEmissiveRadiance = emissive;
#include <logdepthbuf_fragment>
#include <map_fragment>
#include <color_fragment>
#include <alphamap_fragment>
#include <alphatest_fragment>
#include <alphahash_fragment>
#include <specularmap_fragment>
#include <normal_fragment_begin>
#include <normal_fragment_maps>
#include <emissivemap_fragment>
#include <lights_lambert_fragment>
#include <lights_fragment_begin>
#include <lights_fragment_maps>
#include <lights_fragment_end>
#include <aomap_fragment>
vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
#include <envmap_fragment>
#include <opaque_fragment>
#include <tonemapping_fragment>
#include <colorspace_fragment>
#include <fog_fragment>
#include <premultiplied_alpha_fragment>
#include <dithering_fragment>
}
`;var Cd=`#define MATCAP
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <displacementmap_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
#include <uv_vertex>
#include <color_vertex>
#include <morphinstance_vertex>
#include <morphcolor_vertex>
#include <batching_vertex>
#include <beginnormal_vertex>
#include <morphnormal_vertex>
#include <skinbase_vertex>
#include <skinnormal_vertex>
#include <defaultnormal_vertex>
#include <normal_vertex>
#include <begin_vertex>
#include <morphtarget_vertex>
#include <skinning_vertex>
#include <displacementmap_vertex>
#include <project_vertex>
#include <logdepthbuf_vertex>
#include <clipping_planes_vertex>
#include <fog_vertex>
vViewPosition = - mvPosition.xyz;
}
`,Pd=`#define MATCAP
uniform vec3 diffuse;
uniform float opacity;
uniform sampler2D matcap;
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
vec4 diffuseColor = vec4( diffuse, opacity );
#include <clipping_planes_fragment>
#include <logdepthbuf_fragment>
#include <map_fragment>
#include <color_fragment>
#include <alphamap_fragment>
#include <alphatest_fragment>
#include <alphahash_fragment>
#include <normal_fragment_begin>
#include <normal_fragment_maps>
vec3 viewDir = normalize( vViewPosition );
vec3 x = normalize( vec3( viewDir.z, 0.0, - viewDir.x ) );
vec3 y = cross( viewDir, x );
vec2 uv = vec2( dot( x, normal ), dot( y, normal ) ) * 0.495 + 0.5;
#ifdef USE_MATCAP
vec4 matcapColor = texture2D( matcap, uv );
#else
vec4 matcapColor = vec4( vec3( mix( 0.2, 0.8, uv.y ) ), 1.0 );
#endif
vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;
#include <opaque_fragment>
#include <tonemapping_fragment>
#include <colorspace_fragment>
#include <fog_fragment>
#include <premultiplied_alpha_fragment>
#include <dithering_fragment>
}
`;var Ld=`#define NORMAL
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
varying vec3 vViewPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
#include <uv_vertex>
#include <batching_vertex>
#include <beginnormal_vertex>
#include <morphinstance_vertex>
#include <morphnormal_vertex>
#include <skinbase_vertex>
#include <skinnormal_vertex>
#include <defaultnormal_vertex>
#include <normal_vertex>
#include <begin_vertex>
#include <morphtarget_vertex>
#include <skinning_vertex>
#include <displacementmap_vertex>
#include <project_vertex>
#include <logdepthbuf_vertex>
#include <clipping_planes_vertex>
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
vViewPosition = - mvPosition.xyz;
#endif
}
`,Dd=`#define NORMAL
uniform float opacity;
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
varying vec3 vViewPosition;
#endif
#include <uv_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
vec4 diffuseColor = vec4( 0.0, 0.0, 0.0, opacity );
#include <clipping_planes_fragment>
#include <logdepthbuf_fragment>
#include <normal_fragment_begin>
#include <normal_fragment_maps>
gl_FragColor = vec4( normalize( normal ) * 0.5 + 0.5, diffuseColor.a );
#ifdef OPAQUE
gl_FragColor.a = 1.0;
#endif
}
`;var Id=`#define PHONG
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
#include <uv_vertex>
#include <color_vertex>
#include <morphcolor_vertex>
#include <batching_vertex>
#include <beginnormal_vertex>
#include <morphinstance_vertex>
#include <morphnormal_vertex>
#include <skinbase_vertex>
#include <skinnormal_vertex>
#include <defaultnormal_vertex>
#include <normal_vertex>
#include <begin_vertex>
#include <morphtarget_vertex>
#include <skinning_vertex>
#include <displacementmap_vertex>
#include <project_vertex>
#include <logdepthbuf_vertex>
#include <clipping_planes_vertex>
vViewPosition = - mvPosition.xyz;
#include <worldpos_vertex>
#include <envmap_vertex>
#include <shadowmap_vertex>
#include <fog_vertex>
}
`,Fd=`#define PHONG
uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_phong_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
vec4 diffuseColor = vec4( diffuse, opacity );
#include <clipping_planes_fragment>
ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
vec3 totalEmissiveRadiance = emissive;
#include <logdepthbuf_fragment>
#include <map_fragment>
#include <color_fragment>
#include <alphamap_fragment>
#include <alphatest_fragment>
#include <alphahash_fragment>
#include <specularmap_fragment>
#include <normal_fragment_begin>
#include <normal_fragment_maps>
#include <emissivemap_fragment>
#include <lights_phong_fragment>
#include <lights_fragment_begin>
#include <lights_fragment_maps>
#include <lights_fragment_end>
#include <aomap_fragment>
vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
#include <envmap_fragment>
#include <opaque_fragment>
#include <tonemapping_fragment>
#include <colorspace_fragment>
#include <fog_fragment>
#include <premultiplied_alpha_fragment>
#include <dithering_fragment>
}
`;var Ud=`#define STANDARD
varying vec3 vViewPosition;
#ifdef USE_TRANSMISSION
varying vec3 vWorldPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
#include <uv_vertex>
#include <color_vertex>
#include <morphinstance_vertex>
#include <morphcolor_vertex>
#include <batching_vertex>
#include <beginnormal_vertex>
#include <morphnormal_vertex>
#include <skinbase_vertex>
#include <skinnormal_vertex>
#include <defaultnormal_vertex>
#include <normal_vertex>
#include <begin_vertex>
#include <morphtarget_vertex>
#include <skinning_vertex>
#include <displacementmap_vertex>
#include <project_vertex>
#include <logdepthbuf_vertex>
#include <clipping_planes_vertex>
vViewPosition = - mvPosition.xyz;
#include <worldpos_vertex>
#include <shadowmap_vertex>
#include <fog_vertex>
#ifdef USE_TRANSMISSION
vWorldPosition = worldPosition.xyz;
#endif
}
`,Nd=`#define STANDARD
#ifdef PHYSICAL
#define IOR
#define USE_SPECULAR
#endif
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float roughness;
uniform float metalness;
uniform float opacity;
#ifdef IOR
uniform float ior;
#endif
#ifdef USE_SPECULAR
uniform float specularIntensity;
uniform vec3 specularColor;
#ifdef USE_SPECULAR_COLORMAP
uniform sampler2D specularColorMap;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
uniform sampler2D specularIntensityMap;
#endif
#endif
#ifdef USE_CLEARCOAT
uniform float clearcoat;
uniform float clearcoatRoughness;
#endif
#ifdef USE_DISPERSION
uniform float dispersion;
#endif
#ifdef USE_RETROREFLECTION
uniform float retroreflectivity;
#endif
#ifdef USE_IRIDESCENCE
uniform float iridescence;
uniform float iridescenceIOR;
uniform float iridescenceThicknessMinimum;
uniform float iridescenceThicknessMaximum;
#endif
#ifdef USE_SHEEN
uniform vec3 sheenColor;
uniform float sheenRoughness;
#ifdef USE_SHEEN_COLORMAP
uniform sampler2D sheenColorMap;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
uniform sampler2D sheenRoughnessMap;
#endif
#endif
#ifdef USE_ANISOTROPY
uniform vec2 anisotropyVector;
#ifdef USE_ANISOTROPYMAP
uniform sampler2D anisotropyMap;
#endif
#endif
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <iridescence_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_physical_pars_fragment>
#include <transmission_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <clearcoat_pars_fragment>
#include <iridescence_pars_fragment>
#include <roughnessmap_pars_fragment>
#include <metalnessmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
vec4 diffuseColor = vec4( diffuse, opacity );
#include <clipping_planes_fragment>
ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
vec3 totalEmissiveRadiance = emissive;
#include <logdepthbuf_fragment>
#include <map_fragment>
#include <color_fragment>
#include <alphamap_fragment>
#include <alphatest_fragment>
#include <alphahash_fragment>
#include <roughnessmap_fragment>
#include <metalnessmap_fragment>
#include <normal_fragment_begin>
#include <normal_fragment_maps>
#include <clearcoat_normal_fragment_begin>
#include <clearcoat_normal_fragment_maps>
#include <emissivemap_fragment>
#include <lights_physical_fragment>
#include <lights_fragment_begin>
#include <lights_fragment_maps>
#include <lights_fragment_end>
#include <aomap_fragment>
vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
#include <transmission_fragment>
vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
#ifdef USE_SHEEN
outgoingLight = outgoingLight + sheenSpecularDirect + sheenSpecularIndirect;
#endif
#ifdef USE_CLEARCOAT
float dotNVcc = saturate( dot( geometryClearcoatNormal, geometryViewDir ) );
vec3 Fcc = F_Schlick( material.clearcoatF0, material.clearcoatF90, dotNVcc );
outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;
#endif
#include <opaque_fragment>
#include <tonemapping_fragment>
#include <colorspace_fragment>
#include <fog_fragment>
#include <premultiplied_alpha_fragment>
#include <dithering_fragment>
}
`;var Od=`#define TOON
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
#include <uv_vertex>
#include <color_vertex>
#include <morphinstance_vertex>
#include <morphcolor_vertex>
#include <batching_vertex>
#include <beginnormal_vertex>
#include <morphnormal_vertex>
#include <skinbase_vertex>
#include <skinnormal_vertex>
#include <defaultnormal_vertex>
#include <normal_vertex>
#include <begin_vertex>
#include <morphtarget_vertex>
#include <skinning_vertex>
#include <displacementmap_vertex>
#include <project_vertex>
#include <logdepthbuf_vertex>
#include <clipping_planes_vertex>
vViewPosition = - mvPosition.xyz;
#include <worldpos_vertex>
#include <shadowmap_vertex>
#include <fog_vertex>
}
`,Bd=`#define TOON
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <gradientmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_toon_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
vec4 diffuseColor = vec4( diffuse, opacity );
#include <clipping_planes_fragment>
ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
vec3 totalEmissiveRadiance = emissive;
#include <logdepthbuf_fragment>
#include <map_fragment>
#include <color_fragment>
#include <alphamap_fragment>
#include <alphatest_fragment>
#include <alphahash_fragment>
#include <normal_fragment_begin>
#include <normal_fragment_maps>
#include <emissivemap_fragment>
#include <lights_toon_fragment>
#include <lights_fragment_begin>
#include <lights_fragment_maps>
#include <lights_fragment_end>
#include <aomap_fragment>
vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
#include <opaque_fragment>
#include <tonemapping_fragment>
#include <colorspace_fragment>
#include <fog_fragment>
#include <premultiplied_alpha_fragment>
#include <dithering_fragment>
}
`;var Gd=`uniform float size;
uniform float scale;
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
#ifdef USE_POINTS_UV
varying vec2 vUv;
uniform mat3 uvTransform;
#endif
void main() {
#ifdef USE_POINTS_UV
vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
#endif
#include <color_vertex>
#include <morphinstance_vertex>
#include <morphcolor_vertex>
#include <begin_vertex>
#include <morphtarget_vertex>
#include <project_vertex>
gl_PointSize = size;
#ifdef USE_SIZEATTENUATION
bool isPerspective = isPerspectiveMatrix( projectionMatrix );
if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );
#endif
#include <logdepthbuf_vertex>
#include <clipping_planes_vertex>
#include <worldpos_vertex>
#include <fog_vertex>
}
`,zd=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <color_pars_fragment>
#include <map_particle_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
vec4 diffuseColor = vec4( diffuse, opacity );
#include <clipping_planes_fragment>
vec3 outgoingLight = vec3( 0.0 );
#include <logdepthbuf_fragment>
#include <map_particle_fragment>
#include <color_fragment>
#include <alphatest_fragment>
#include <alphahash_fragment>
outgoingLight = diffuseColor.rgb;
#include <opaque_fragment>
#include <tonemapping_fragment>
#include <colorspace_fragment>
#include <fog_fragment>
#include <premultiplied_alpha_fragment>
}
`;var Vd=`#include <common>
#include <batching_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <shadowmap_pars_vertex>
void main() {
#include <batching_vertex>
#include <beginnormal_vertex>
#include <morphinstance_vertex>
#include <morphnormal_vertex>
#include <skinbase_vertex>
#include <skinnormal_vertex>
#include <defaultnormal_vertex>
#include <begin_vertex>
#include <morphtarget_vertex>
#include <skinning_vertex>
#include <project_vertex>
#include <logdepthbuf_vertex>
#include <worldpos_vertex>
#include <shadowmap_vertex>
#include <fog_vertex>
}
`,Hd=`uniform vec3 color;
uniform float opacity;
#include <common>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <logdepthbuf_pars_fragment>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
void main() {
#include <logdepthbuf_fragment>
gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );
#include <tonemapping_fragment>
#include <colorspace_fragment>
#include <fog_fragment>
#include <premultiplied_alpha_fragment>
}
`;var kd=`uniform float rotation;
uniform vec2 center;
#include <common>
#include <uv_pars_vertex>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
#include <uv_vertex>
vec4 mvPosition = modelViewMatrix[ 3 ];
vec2 scale = vec2( length( modelMatrix[ 0 ].xyz ), length( modelMatrix[ 1 ].xyz ) );
#ifndef USE_SIZEATTENUATION
bool isPerspective = isPerspectiveMatrix( projectionMatrix );
if ( isPerspective ) scale *= - mvPosition.z;
#endif
vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;
vec2 rotatedPosition;
rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;
rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;
mvPosition.xy += rotatedPosition;
gl_Position = projectionMatrix * mvPosition;
#include <logdepthbuf_vertex>
#include <clipping_planes_vertex>
#include <fog_vertex>
}
`,Wd=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
vec4 diffuseColor = vec4( diffuse, opacity );
#include <clipping_planes_fragment>
vec3 outgoingLight = vec3( 0.0 );
#include <logdepthbuf_fragment>
#include <map_fragment>
#include <alphamap_fragment>
#include <alphatest_fragment>
#include <alphahash_fragment>
outgoingLight = diffuseColor.rgb;
#include <opaque_fragment>
#include <tonemapping_fragment>
#include <colorspace_fragment>
#include <fog_fragment>
}
`;var Ke={alphahash_fragment:uu,alphahash_pars_fragment:hu,alphamap_fragment:du,alphamap_pars_fragment:pu,alphatest_fragment:mu,alphatest_pars_fragment:gu,aomap_fragment:_u,aomap_pars_fragment:xu,batching_pars_vertex:Mu,batching_vertex:vu,begin_vertex:Su,beginnormal_vertex:yu,bsdfs:Eu,iridescence_fragment:bu,bumpmap_pars_fragment:Tu,clipping_planes_fragment:Au,clipping_planes_pars_fragment:wu,clipping_planes_pars_vertex:Ru,clipping_planes_vertex:Cu,color_fragment:Pu,color_pars_fragment:Lu,color_pars_vertex:Du,color_vertex:Iu,common:Fu,cube_uv_reflection_fragment:Uu,defaultnormal_vertex:Nu,displacementmap_pars_vertex:Ou,displacementmap_vertex:Bu,emissivemap_fragment:Gu,emissivemap_pars_fragment:zu,colorspace_fragment:Vu,colorspace_pars_fragment:Hu,envmap_fragment:ku,envmap_common_pars_fragment:Wu,envmap_pars_fragment:Xu,envmap_pars_vertex:qu,envmap_physical_pars_fragment:nh,envmap_vertex:Yu,fog_vertex:Zu,fog_pars_vertex:Ku,fog_fragment:Ju,fog_pars_fragment:$u,gradientmap_pars_fragment:Qu,lightmap_pars_fragment:ju,lights_lambert_fragment:eh,lights_lambert_pars_fragment:th,lights_pars_begin:ih,lights_toon_fragment:rh,lights_toon_pars_fragment:oh,lights_phong_fragment:sh,lights_phong_pars_fragment:ah,lights_physical_fragment:lh,lights_physical_pars_fragment:ch,lights_fragment_begin:fh,lights_fragment_maps:uh,lights_fragment_end:hh,lightprobes_pars_fragment:dh,logdepthbuf_fragment:ph,logdepthbuf_pars_fragment:mh,logdepthbuf_pars_vertex:gh,logdepthbuf_vertex:_h,map_fragment:xh,map_pars_fragment:Mh,map_particle_fragment:vh,map_particle_pars_fragment:Sh,metalnessmap_fragment:yh,metalnessmap_pars_fragment:Eh,morphinstance_vertex:bh,morphcolor_vertex:Th,morphnormal_vertex:Ah,morphtarget_pars_vertex:wh,morphtarget_vertex:Rh,normal_fragment_begin:Ch,normal_fragment_maps:Ph,normal_pars_fragment:Lh,normal_pars_vertex:Dh,normal_vertex:Ih,normalmap_pars_fragment:Fh,clearcoat_normal_fragment_begin:Uh,clearcoat_normal_fragment_maps:Nh,clearcoat_pars_fragment:Oh,iridescence_pars_fragment:Bh,opaque_fragment:Gh,packing:zh,premultiplied_alpha_fragment:Vh,project_vertex:Hh,dithering_fragment:kh,dithering_pars_fragment:Wh,roughnessmap_fragment:Xh,roughnessmap_pars_fragment:qh,shadowmap_pars_fragment:Yh,shadowmap_pars_vertex:Zh,shadowmap_vertex:Kh,shadowmask_pars_fragment:Jh,skinbase_vertex:$h,skinning_pars_vertex:Qh,skinning_vertex:jh,skinnormal_vertex:ed,specularmap_fragment:td,specularmap_pars_fragment:id,tonemapping_fragment:nd,tonemapping_pars_fragment:rd,transmission_fragment:od,transmission_pars_fragment:sd,uv_pars_fragment:ad,uv_pars_vertex:ld,uv_vertex:cd,worldpos_vertex:fd,background_vert:ud,background_frag:hd,backgroundCube_vert:dd,backgroundCube_frag:pd,cube_vert:md,cube_frag:gd,depth_vert:_d,depth_frag:xd,distance_vert:Md,distance_frag:vd,equirect_vert:Sd,equirect_frag:yd,linedashed_vert:Ed,linedashed_frag:bd,meshbasic_vert:Td,meshbasic_frag:Ad,meshlambert_vert:wd,meshlambert_frag:Rd,meshmatcap_vert:Cd,meshmatcap_frag:Pd,meshnormal_vert:Ld,meshnormal_frag:Dd,meshphong_vert:Id,meshphong_frag:Fd,meshphysical_vert:Ud,meshphysical_frag:Nd,meshtoon_vert:Od,meshtoon_frag:Bd,points_vert:Gd,points_frag:zd,shadow_vert:Vd,shadow_frag:Hd,sprite_vert:kd,sprite_frag:Wd};var ve={common:{diffuse:{value:new Ee(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new Be},alphaMap:{value:null},alphaMapTransform:{value:new Be},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new Be}},envmap:{envMap:{value:null},envMapRotation:{value:new Be},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98},dfgLUT:{value:null}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new Be}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new Be}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new Be},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new Be},normalScale:{value:new Ne(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new Be},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new Be}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new Be}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new Be}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new Ee(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},sunLights:{value:[],properties:{direction:{},color:{}}},sunLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},sunShadowMatrix:{value:[]},sunShadowCascade:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null},probesSH:{value:null},probesMin:{value:new L},probesMax:{value:new L},probesResolution:{value:new L}},points:{diffuse:{value:new Ee(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new Be},alphaTest:{value:0},uvTransform:{value:new Be}},sprite:{diffuse:{value:new Ee(16777215)},opacity:{value:1},center:{value:new Ne(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new Be},alphaMap:{value:null},alphaMapTransform:{value:new Be},alphaTest:{value:0}}};var Qi={basic:{uniforms:Si([ve.common,ve.specularmap,ve.envmap,ve.aomap,ve.lightmap,ve.fog]),vertexShader:Ke.meshbasic_vert,fragmentShader:Ke.meshbasic_frag},lambert:{uniforms:Si([ve.common,ve.specularmap,ve.envmap,ve.aomap,ve.lightmap,ve.emissivemap,ve.bumpmap,ve.normalmap,ve.displacementmap,ve.fog,ve.lights,{emissive:{value:new Ee(0)},envMapIntensity:{value:1}}]),vertexShader:Ke.meshlambert_vert,fragmentShader:Ke.meshlambert_frag},phong:{uniforms:Si([ve.common,ve.specularmap,ve.envmap,ve.aomap,ve.lightmap,ve.emissivemap,ve.bumpmap,ve.normalmap,ve.displacementmap,ve.fog,ve.lights,{emissive:{value:new Ee(0)},specular:{value:new Ee(1118481)},shininess:{value:30},envMapIntensity:{value:1}}]),vertexShader:Ke.meshphong_vert,fragmentShader:Ke.meshphong_frag},standard:{uniforms:Si([ve.common,ve.envmap,ve.aomap,ve.lightmap,ve.emissivemap,ve.bumpmap,ve.normalmap,ve.displacementmap,ve.roughnessmap,ve.metalnessmap,ve.fog,ve.lights,{emissive:{value:new Ee(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:Ke.meshphysical_vert,fragmentShader:Ke.meshphysical_frag},toon:{uniforms:Si([ve.common,ve.aomap,ve.lightmap,ve.emissivemap,ve.bumpmap,ve.normalmap,ve.displacementmap,ve.gradientmap,ve.fog,ve.lights,{emissive:{value:new Ee(0)}}]),vertexShader:Ke.meshtoon_vert,fragmentShader:Ke.meshtoon_frag},matcap:{uniforms:Si([ve.common,ve.bumpmap,ve.normalmap,ve.displacementmap,ve.fog,{matcap:{value:null}}]),vertexShader:Ke.meshmatcap_vert,fragmentShader:Ke.meshmatcap_frag},points:{uniforms:Si([ve.points,ve.fog]),vertexShader:Ke.points_vert,fragmentShader:Ke.points_frag},dashed:{uniforms:Si([ve.common,ve.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:Ke.linedashed_vert,fragmentShader:Ke.linedashed_frag},depth:{uniforms:Si([ve.common,ve.displacementmap]),vertexShader:Ke.depth_vert,fragmentShader:Ke.depth_frag},normal:{uniforms:Si([ve.common,ve.bumpmap,ve.normalmap,ve.displacementmap,{opacity:{value:1}}]),vertexShader:Ke.meshnormal_vert,fragmentShader:Ke.meshnormal_frag},sprite:{uniforms:Si([ve.sprite,ve.fog]),vertexShader:Ke.sprite_vert,fragmentShader:Ke.sprite_frag},background:{uniforms:{uvTransform:{value:new Be},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:Ke.background_vert,fragmentShader:Ke.background_frag},backgroundCube:{uniforms:{envMap:{value:null},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new Be}},vertexShader:Ke.backgroundCube_vert,fragmentShader:Ke.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:Ke.cube_vert,fragmentShader:Ke.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:Ke.equirect_vert,fragmentShader:Ke.equirect_frag},distance:{uniforms:Si([ve.common,ve.displacementmap,{referencePosition:{value:new L},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:Ke.distance_vert,fragmentShader:Ke.distance_frag},shadow:{uniforms:Si([ve.lights,ve.fog,{color:{value:new Ee(0)},opacity:{value:1}}]),vertexShader:Ke.shadow_vert,fragmentShader:Ke.shadow_frag}};Qi.physical={uniforms:Si([Qi.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new Be},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new Be},clearcoatNormalScale:{value:new Ne(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new Be},dispersion:{value:0},retroreflectivity:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new Be},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new Be},sheen:{value:0},sheenColor:{value:new Ee(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new Be},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new Be},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new Be},transmissionSamplerSize:{value:new Ne},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new Be},attenuationDistance:{value:0},attenuationColor:{value:new Ee(0)},specularColor:{value:new Ee(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new Be},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new Be},anisotropyVector:{value:new Ne},anisotropyMap:{value:null},anisotropyMapTransform:{value:new Be}}]),vertexShader:Ke.meshphysical_vert,fragmentShader:Ke.meshphysical_frag};var dl={r:0,b:0,g:0},d0=new Ze,Xd=new Be;Xd.set(-1,0,0,0,1,0,0,0,1);function qd(n,e,t,i,r,o){let s=new Ee(0),a=r===!0?0:1,c,l,f=null,h=0,u=null;function d(E){let C=E.isScene===!0?E.background:null;if(C&&C.isTexture){let S=E.backgroundBlurriness>0;C=e.get(C,S)}return C}function _(E){let C=!1,S=d(E);S===null?m(s,a):S&&S.isColor&&(m(S,1),C=!0);let b=n.xr.getEnvironmentBlendMode();b==="additive"?t.buffers.color.setClear(0,0,0,1,o):b==="alpha-blend"&&t.buffers.color.setClear(0,0,0,0,o),(n.autoClear||C)&&(t.buffers.depth.setTest(!0),t.buffers.depth.setMask(!0),t.buffers.color.setMask(!0),n.clear(n.autoClearColor,n.autoClearDepth,n.autoClearStencil))}function v(E,C){let S=d(C);S&&(S.isCubeTexture||S.mapping===$n)?(l===void 0&&(l=new We(new vi(1,1,1),new yi({name:"BackgroundCubeMaterial",uniforms:Bn(Qi.backgroundCube.uniforms),vertexShader:Qi.backgroundCube.vertexShader,fragmentShader:Qi.backgroundCube.fragmentShader,side:Rt,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),l.geometry.deleteAttribute("normal"),l.geometry.deleteAttribute("uv"),l.onBeforeRender=function(b,T,P){this.matrixWorld.copyPosition(P.matrixWorld)},Object.defineProperty(l.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),i.update(l)),l.material.uniforms.envMap.value=S,l.material.uniforms.backgroundBlurriness.value=C.backgroundBlurriness,l.material.uniforms.backgroundIntensity.value=C.backgroundIntensity,l.material.uniforms.backgroundRotation.value.setFromMatrix4(d0.makeRotationFromEuler(C.backgroundRotation)).transpose(),S.isCubeTexture&&S.isRenderTargetTexture===!1&&l.material.uniforms.backgroundRotation.value.premultiply(Xd),l.material.toneMapped=Ye.getTransfer(S.colorSpace)!==st,(f!==S||h!==S.version||u!==n.toneMapping)&&(l.material.needsUpdate=!0,f=S,h=S.version,u=n.toneMapping),l.layers.enableAll(),E.unshift(l,l.geometry,l.material,0,0,null)):S&&S.isTexture&&(c===void 0&&(c=new We(new ni(2,2),new yi({name:"BackgroundMaterial",uniforms:Bn(Qi.background.uniforms),vertexShader:Qi.background.vertexShader,fragmentShader:Qi.background.fragmentShader,side:Xi,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),c.geometry.deleteAttribute("normal"),Object.defineProperty(c.material,"map",{get:function(){return this.uniforms.t2D.value}}),i.update(c)),c.material.uniforms.t2D.value=S,c.material.uniforms.backgroundIntensity.value=C.backgroundIntensity,c.material.toneMapped=Ye.getTransfer(S.colorSpace)!==st,S.matrixAutoUpdate===!0&&S.updateMatrix(),c.material.uniforms.uvTransform.value.copy(S.matrix),(f!==S||h!==S.version||u!==n.toneMapping)&&(c.material.needsUpdate=!0,f=S,h=S.version,u=n.toneMapping),c.layers.enableAll(),E.unshift(c,c.geometry,c.material,0,0,null))}function m(E,C){E.getRGB(dl,rl(n)),t.buffers.color.setClear(dl.r,dl.g,dl.b,C,o)}function p(){l!==void 0&&(l.geometry.dispose(),l.material.dispose(),l=void 0),c!==void 0&&(c.geometry.dispose(),c.material.dispose(),c=void 0)}return{getClearColor:function(){return s},setClearColor:function(E,C=1){s.set(E),a=C,m(s,a)},getClearAlpha:function(){return a},setClearAlpha:function(E){a=E,m(s,a)},render:_,addToRenderList:v,dispose:p}}function Yd(n,e){let t=n.getParameter(n.MAX_VERTEX_ATTRIBS),i={},r=u(null),o=r,s=!1;function a(G,z,Y,N,F){let te=!1,$=h(G,N,Y,z);o!==$&&(o=$,l(o.object)),te=d(G,N,Y,F),te&&_(G,N,Y,F),F!==null&&e.update(F,n.ELEMENT_ARRAY_BUFFER),(te||s)&&(s=!1,S(G,z,Y,N),F!==null&&n.bindBuffer(n.ELEMENT_ARRAY_BUFFER,e.get(F).buffer))}function c(){return n.createVertexArray()}function l(G){return n.bindVertexArray(G)}function f(G){return n.deleteVertexArray(G)}function h(G,z,Y,N){let F=N.wireframe===!0,te=i[z.id];te===void 0&&(te={},i[z.id]=te);let $=G.isInstancedMesh===!0?G.id:0,ae=te[$];ae===void 0&&(ae={},te[$]=ae);let j=ae[Y.id];j===void 0&&(j={},ae[Y.id]=j);let re=j[F];return re===void 0&&(re=u(c()),j[F]=re),re}function u(G){let z=[],Y=[],N=[];for(let F=0;F<t;F++)z[F]=0,Y[F]=0,N[F]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:z,enabledAttributes:Y,attributeDivisors:N,object:G,attributes:{},index:null}}function d(G,z,Y,N){let F=o.attributes,te=z.attributes,$=0,ae=Y.getAttributes();for(let j in ae)if(ae[j].location>=0){let oe=F[j],Ge=te[j];if(Ge===void 0&&(j==="instanceMatrix"&&G.instanceMatrix&&(Ge=G.instanceMatrix),j==="instanceColor"&&G.instanceColor&&(Ge=G.instanceColor)),oe===void 0||oe.attribute!==Ge||Ge&&oe.data!==Ge.data)return!0;$++}return o.attributesNum!==$||o.index!==N}function _(G,z,Y,N){let F={},te=z.attributes,$=0,ae=Y.getAttributes();for(let j in ae)if(ae[j].location>=0){let oe=te[j];oe===void 0&&(j==="instanceMatrix"&&G.instanceMatrix&&(oe=G.instanceMatrix),j==="instanceColor"&&G.instanceColor&&(oe=G.instanceColor));let Ge={};Ge.attribute=oe,oe&&oe.data&&(Ge.data=oe.data),F[j]=Ge,$++}o.attributes=F,o.attributesNum=$,o.index=N}function v(){let G=o.newAttributes;for(let z=0,Y=G.length;z<Y;z++)G[z]=0}function m(G){p(G,0)}function p(G,z){let Y=o.newAttributes,N=o.enabledAttributes,F=o.attributeDivisors;Y[G]=1,N[G]===0&&(n.enableVertexAttribArray(G),N[G]=1),F[G]!==z&&(n.vertexAttribDivisor(G,z),F[G]=z)}function E(){let G=o.newAttributes,z=o.enabledAttributes;for(let Y=0,N=z.length;Y<N;Y++)z[Y]!==G[Y]&&(n.disableVertexAttribArray(Y),z[Y]=0)}function C(G,z,Y,N,F,te,$){$===!0?n.vertexAttribIPointer(G,z,Y,F,te):n.vertexAttribPointer(G,z,Y,N,F,te)}function S(G,z,Y,N){v();let F=N.attributes,te=Y.getAttributes(),$=z.defaultAttributeValues;for(let ae in te){let j=te[ae];if(j.location>=0){let re=F[ae];if(re===void 0&&(ae==="instanceMatrix"&&G.instanceMatrix&&(re=G.instanceMatrix),ae==="instanceColor"&&G.instanceColor&&(re=G.instanceColor)),re!==void 0){let oe=re.normalized,Ge=re.itemSize,Oe=e.get(re);if(Oe===void 0)continue;let Dt=Oe.buffer,at=Oe.type,ct=Oe.bytesPerElement,xt=at===n.INT||at===n.UNSIGNED_INT||re.gpuType===Xr;if(re.isInterleavedBufferAttribute){let ye=re.data,pt=ye.stride,Gt=re.offset;if(ye.isInstancedInterleavedBuffer){for(let Ie=0;Ie<j.locationSize;Ie++)p(j.location+Ie,ye.meshPerAttribute);G.isInstancedMesh!==!0&&N._maxInstanceCount===void 0&&(N._maxInstanceCount=ye.meshPerAttribute*ye.count)}else for(let Ie=0;Ie<j.locationSize;Ie++)m(j.location+Ie);n.bindBuffer(n.ARRAY_BUFFER,Dt);for(let Ie=0;Ie<j.locationSize;Ie++)C(j.location+Ie,Ge/j.locationSize,at,oe,pt*ct,(Gt+Ge/j.locationSize*Ie)*ct,xt)}else{if(re.isInstancedBufferAttribute){for(let ye=0;ye<j.locationSize;ye++)p(j.location+ye,re.meshPerAttribute);G.isInstancedMesh!==!0&&N._maxInstanceCount===void 0&&(N._maxInstanceCount=re.meshPerAttribute*re.count)}else for(let ye=0;ye<j.locationSize;ye++)m(j.location+ye);n.bindBuffer(n.ARRAY_BUFFER,Dt);for(let ye=0;ye<j.locationSize;ye++)C(j.location+ye,Ge/j.locationSize,at,oe,Ge*ct,Ge/j.locationSize*ye*ct,xt)}}else if($!==void 0){let oe=$[ae];if(oe!==void 0)switch(oe.length){case 2:n.vertexAttrib2fv(j.location,oe);break;case 3:n.vertexAttrib3fv(j.location,oe);break;case 4:n.vertexAttrib4fv(j.location,oe);break;default:n.vertexAttrib1fv(j.location,oe)}}}}E()}function b(){A();for(let G in i){let z=i[G];for(let Y in z){let N=z[Y];for(let F in N){let te=N[F];for(let $ in te)f(te[$].object),delete te[$];delete N[F]}}delete i[G]}}function T(G){if(i[G.id]===void 0)return;let z=i[G.id];for(let Y in z){let N=z[Y];for(let F in N){let te=N[F];for(let $ in te)f(te[$].object),delete te[$];delete N[F]}}delete i[G.id]}function P(G){for(let z in i){let Y=i[z];for(let N in Y){let F=Y[N];if(F[G.id]===void 0)continue;let te=F[G.id];for(let $ in te)f(te[$].object),delete te[$];delete F[G.id]}}}function x(G){for(let z in i){let Y=i[z],N=G.isInstancedMesh===!0?G.id:0,F=Y[N];if(F!==void 0){for(let te in F){let $=F[te];for(let ae in $)f($[ae].object),delete $[ae];delete F[te]}delete Y[N],Object.keys(Y).length===0&&delete i[z]}}}function A(){D(),s=!0,o!==r&&(o=r,l(o.object))}function D(){r.geometry=null,r.program=null,r.wireframe=!1}return{setup:a,reset:A,resetDefaultState:D,dispose:b,releaseStatesOfGeometry:T,releaseStatesOfObject:x,releaseStatesOfProgram:P,initAttributes:v,enableAttribute:m,disableUnusedAttributes:E}}function Zd(n,e,t){let i;function r(c){i=c}function o(c,l){n.drawArrays(i,c,l),t.update(l,i,1)}function s(c,l,f){f!==0&&(n.drawArraysInstanced(i,c,l,f),t.update(l,i,f))}function a(c,l,f){if(f===0)return;e.get("WEBGL_multi_draw").multiDrawArraysWEBGL(i,c,0,l,0,f);let u=0;for(let d=0;d<f;d++)u+=l[d];t.update(u,i,1)}this.setMode=r,this.render=o,this.renderInstances=s,this.renderMultiDraw=a}function Kd(n,e,t,i){let r;function o(){if(r!==void 0)return r;if(e.has("EXT_texture_filter_anisotropic")===!0){let P=e.get("EXT_texture_filter_anisotropic");r=n.getParameter(P.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else r=0;return r}function s(P){return!(P!==Ci&&i.convert(P)!==n.getParameter(n.IMPLEMENTATION_COLOR_READ_FORMAT))}function a(P){let x=P===jt&&(e.has("EXT_color_buffer_half_float")||e.has("EXT_color_buffer_float"));return!(P!==Qt&&P!==Kt&&!x&&i.convert(P)!==n.getParameter(n.IMPLEMENTATION_COLOR_READ_TYPE))}function c(P){if(P==="highp"){if(n.getShaderPrecisionFormat(n.VERTEX_SHADER,n.HIGH_FLOAT).precision>0&&n.getShaderPrecisionFormat(n.FRAGMENT_SHADER,n.HIGH_FLOAT).precision>0)return"highp";P="mediump"}return P==="mediump"&&n.getShaderPrecisionFormat(n.VERTEX_SHADER,n.MEDIUM_FLOAT).precision>0&&n.getShaderPrecisionFormat(n.FRAGMENT_SHADER,n.MEDIUM_FLOAT).precision>0?"mediump":"lowp"}let l=t.precision!==void 0?t.precision:"highp",f=c(l);f!==l&&(Re("WebGLRenderer:",l,"not supported, using",f,"instead."),l=f);let h=t.logarithmicDepthBuffer===!0,u=t.reversedDepthBuffer===!0&&e.has("EXT_clip_control");t.reversedDepthBuffer===!0&&u===!1&&Re("WebGLRenderer: Unable to use reversed depth buffer due to missing EXT_clip_control extension. Fallback to default depth buffer.");let d=n.getParameter(n.MAX_TEXTURE_IMAGE_UNITS),_=n.getParameter(n.MAX_VERTEX_TEXTURE_IMAGE_UNITS),v=n.getParameter(n.MAX_TEXTURE_SIZE),m=n.getParameter(n.MAX_CUBE_MAP_TEXTURE_SIZE),p=n.getParameter(n.MAX_VERTEX_ATTRIBS),E=n.getParameter(n.MAX_VERTEX_UNIFORM_VECTORS),C=n.getParameter(n.MAX_VARYING_VECTORS),S=n.getParameter(n.MAX_FRAGMENT_UNIFORM_VECTORS),b=n.getParameter(n.MAX_SAMPLES),T=n.getParameter(n.SAMPLES);return{isWebGL2:!0,getMaxAnisotropy:o,getMaxPrecision:c,textureFormatReadable:s,textureTypeReadable:a,precision:l,logarithmicDepthBuffer:h,reversedDepthBuffer:u,maxTextures:d,maxVertexTextures:_,maxTextureSize:v,maxCubemapSize:m,maxAttributes:p,maxVertexUniforms:E,maxVaryings:C,maxFragmentUniforms:S,maxSamples:b,samples:T}}function Jd(n){let e=this,t=null,i=0,r=!1,o=!1,s=new Mi,a=new Be,c={value:null,needsUpdate:!1};this.uniform=c,this.numPlanes=0,this.numIntersection=0,this.init=function(h,u){let d=h.length!==0||u||i!==0||r;return r=u,i=h.length,d},this.beginShadows=function(){o=!0,f(null)},this.endShadows=function(){o=!1},this.setGlobalState=function(h,u){t=f(h,u,0)},this.setState=function(h,u,d){let _=h.clippingPlanes,v=h.clipIntersection,m=h.clipShadows,p=n.get(h);if(!r||_===null||_.length===0||o&&!m)o?f(null):l();else{let E=o?0:i,C=E*4,S=p.clippingState||null;c.value=S,S=f(_,u,C,d);for(let b=0;b!==C;++b)S[b]=t[b];p.clippingState=S,this.numIntersection=v?this.numPlanes:0,this.numPlanes+=E}};function l(){c.value!==t&&(c.value=t,c.needsUpdate=i>0),e.numPlanes=i,e.numIntersection=0}function f(h,u,d,_){let v=h!==null?h.length:0,m=null;if(v!==0){if(m=c.value,_!==!0||m===null){let p=d+v*4,E=u.matrixWorldInverse;a.getNormalMatrix(E),(m===null||m.length<p)&&(m=new Float32Array(p));for(let C=0,S=d;C!==v;++C,S+=4)s.copy(h[C]).applyMatrix4(E,a),s.normal.toArray(m,S),m[S+3]=s.constant}c.value=m,c.needsUpdate=!0}return e.numPlanes=v,e.numIntersection=0,m}}var Io=4,p0=6,m0=20,g0=256,Ys=new ar,$d=new Ee,uc=null,hc=0,dc=0,pc=!1,_0=new L,Ir=new L,lr=class{constructor(e){this._renderer=e,this._pingPongRenderTarget=null,this._lodMax=0,this._cubeSize=0,this._sizeLods=[],this._lodMeshes=[],this._backgroundBox=null,this._cubemapMaterial=null,this._equirectMaterial=null,this._blurMaterial=null,this._ggxMaterial=null}fromScene(e,t=0,i=.1,r=100,o={}){let{size:s=256,position:a=_0}=o;uc=this._renderer.getRenderTarget(),hc=this._renderer.getActiveCubeFace(),dc=this._renderer.getActiveMipmapLevel(),pc=this._renderer.xr.enabled,this._renderer.xr.enabled=!1,this._setSize(s);let c=this._allocateTargets();return c.depthBuffer=!0,this._sceneToCubeUV(e,i,r,c,a),t>0&&this._blur(c,0,0,t),this._applyPMREM(c),this._cleanup(c),c}fromEquirectangular(e,t=null){return this._fromTexture(e,t)}fromCubemap(e,t=null){return this._fromTexture(e,t)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=ep(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=jd(),this._compileMaterial(this._equirectMaterial))}dispose(){this._dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose(),this._backgroundBox!==null&&(this._backgroundBox.geometry.dispose(),this._backgroundBox.material.dispose())}_setSize(e){this._lodMax=Math.floor(Math.log2(e)),this._cubeSize=Math.pow(2,this._lodMax)}_dispose(){this._blurMaterial!==null&&this._blurMaterial.dispose(),this._ggxMaterial!==null&&this._ggxMaterial.dispose(),this._pingPongRenderTarget!==null&&this._pingPongRenderTarget.dispose();for(let e=0;e<this._lodMeshes.length;e++)this._lodMeshes[e].geometry.dispose()}_cleanup(e){this._renderer.setRenderTarget(uc,hc,dc),this._renderer.xr.enabled=pc,e.scissorTest=!1,Do(e,0,0,e.width,e.height)}_fromTexture(e,t){e.mapping===qi||e.mapping===Rn?this._setSize(e.image.length===0?16:e.image[0].width||e.image[0].image.width):this._setSize(e.image.width/4),uc=this._renderer.getRenderTarget(),hc=this._renderer.getActiveCubeFace(),dc=this._renderer.getActiveMipmapLevel(),pc=this._renderer.xr.enabled,this._renderer.xr.enabled=!1;let i=t||this._allocateTargets();return this._textureToCubeUV(e,i),this._applyPMREM(i),this._cleanup(i),i}_allocateTargets(){let e=3*Math.max(this._cubeSize,112),t=4*this._cubeSize,i={magFilter:Bt,minFilter:Bt,generateMipmaps:!1,type:jt,format:Ci,colorSpace:Er,depthBuffer:!1},r=Qd(e,t,i);if(this._pingPongRenderTarget===null||this._pingPongRenderTarget.width!==e||this._pingPongRenderTarget.height!==t){this._pingPongRenderTarget!==null&&this._dispose(),this._pingPongRenderTarget=Qd(e,t,i);let{_lodMax:o}=this;({lodMeshes:this._lodMeshes,sizeLods:this._sizeLods}=x0(o)),this._blurMaterial=v0(o,e,t),this._ggxMaterial=M0(o,e,t)}return r}_compileMaterial(e){let t=new We(new Ct,e);this._renderer.compile(t,Ys)}_sceneToCubeUV(e,t,i,r,o){let c=new ri(90,1,t,i),l=[1,-1,1,1,1,1],f=[1,1,1,-1,-1,-1],h=this._renderer,u=h.autoClear,d=h.toneMapping;h.getClearColor($d),h.toneMapping=Ri,h.autoClear=!1,h.state.buffers.depth.getReversed()&&(h.setRenderTarget(r),h.clearDepth(),h.setRenderTarget(null)),this._backgroundBox===null&&(this._backgroundBox=new We(new vi,new vn({name:"PMREM.Background",side:Rt,depthWrite:!1,depthTest:!1})));let v=this._backgroundBox,m=v.material,p=!1,E=e.background;E?E.isColor&&(m.color.copy(E),e.background=null,p=!0):(m.color.copy($d),p=!0);for(let C=0;C<6;C++){let S=C%3;S===0?(c.up.set(0,l[C],0),c.position.set(o.x,o.y,o.z),c.lookAt(o.x+f[C],o.y,o.z)):S===1?(c.up.set(0,0,l[C]),c.position.set(o.x,o.y,o.z),c.lookAt(o.x,o.y+f[C],o.z)):(c.up.set(0,l[C],0),c.position.set(o.x,o.y,o.z),c.lookAt(o.x,o.y,o.z+f[C]));let b=this._cubeSize;Do(r,S*b,C>2?b:0,b,b),h.setRenderTarget(r),p&&h.render(v,c),h.render(e,c)}h.toneMapping=d,h.autoClear=u,e.background=E}_textureToCubeUV(e,t){let i=this._renderer,r=e.mapping===qi||e.mapping===Rn;r?(this._cubemapMaterial===null&&(this._cubemapMaterial=ep()),this._cubemapMaterial.uniforms.flipEnvMap.value=e.isRenderTargetTexture===!1?-1:1):this._equirectMaterial===null&&(this._equirectMaterial=jd());let o=r?this._cubemapMaterial:this._equirectMaterial,s=this._lodMeshes[0];s.material=o;let a=o.uniforms;a.envMap.value=e;let c=this._cubeSize;Do(t,0,0,3*c,2*c),i.setRenderTarget(t),i.render(s,Ys)}_applyPMREM(e){let t=this._renderer,i=t.autoClear;t.autoClear=!1;let r=this._lodMeshes.length;for(let o=1;o<r;o++)this._applyGGXFilter(e,o-1,o);t.autoClear=i}_applyGGXFilter(e,t,i){let r=this._renderer,o=this._pingPongRenderTarget,s=this._ggxMaterial,a=this._lodMeshes[i];a.material=s;let c=s.uniforms,l=i/(this._lodMeshes.length-1),f=t/(this._lodMeshes.length-1),h=Math.sqrt(l*l-f*f),u=l*1.25,d=h*u,{_lodMax:_}=this,v=this._sizeLods[i],m=3*v*(i>_-Io?i-_+Io:0),p=4*(this._cubeSize-v);c.envMap.value=e.texture,c.roughness.value=d,c.mipInt.value=_-t,Do(o,m,p,3*v,2*v),r.setRenderTarget(o),r.render(a,Ys),c.envMap.value=o.texture,c.roughness.value=0,c.mipInt.value=_-i,Do(e,m,p,3*v,2*v),r.setRenderTarget(e),r.render(a,Ys)}_blur(e,t,i,r){let o=this._pingPongRenderTarget,s=Math.min(r,Math.PI)/Math.SQRT2;this._blurPass(e,o,t,i,s),this._blurPass(o,e,i,i,s)}_blurPass(e,t,i,r,o){let s=this._renderer,a=this._blurMaterial,c=this._lodMeshes[r];c.material=a;let l=a.uniforms;l.envMap.value=e.texture,l.sigma.value=o,l.mipInt.value=this._lodMax-i;let f=this._sizeLods[r],h=3*f*(r>this._lodMax-Io?r-this._lodMax+Io:0),u=4*(this._cubeSize-f);Do(t,h,u,3*f,2*f),s.setRenderTarget(t),s.render(c,Ys)}};function x0(n){let e=[],t=[],i=n,r=n-Io+1+p0;for(let o=0;o<r;o++){let s=Math.pow(2,i);e.push(s);let a=1/(s-2),c=-a,l=1+a,f=[c,c,l,c,l,l,c,c,l,l,c,l],h=6,u=6,d=3,_=new Float32Array(d*u*h),v=new Float32Array(d*u*h);for(let p=0;p<h;p++){let E=p%3*2/3-1,C=p>2?0:-1,S=[E,C,0,E+2/3,C,0,E+2/3,C+1,0,E,C,0,E+2/3,C+1,0,E,C+1,0];_.set(S,d*u*p);for(let b=0;b<u;b++){let T=f[b*2]*2-1,P=f[b*2+1]*2-1;p===0?Ir.set(1,P,T):p===1?Ir.set(-T,1,-P):p===2?Ir.set(-T,P,1):p===3?Ir.set(-1,P,-T):p===4?Ir.set(-T,-1,P):Ir.set(T,P,-1),Ir.toArray(v,(p*u+b)*d)}}let m=new Ct;m.setAttribute("position",new Vt(_,d)),m.setAttribute("outputDirection",new Vt(v,d)),t.push(new We(m,null)),i>Io&&i--}return{lodMeshes:t,sizeLods:e}}function Qd(n,e,t){let i=new _i(n,e,t);return i.texture.mapping=$n,i.texture.name="PMREM.cubeUv",i.scissorTest=!0,i}function Do(n,e,t,i,r){n.viewport.set(e,t,i,r),n.scissor.set(e,t,i,r)}function M0(n,e,t){return new yi({name:"PMREMGGXConvolution",defines:{GGX_SAMPLES:g0,CUBEUV_TEXEL_WIDTH:1/e,CUBEUV_TEXEL_HEIGHT:1/t,CUBEUV_MAX_MIP:`${n}.0`},uniforms:{envMap:{value:null},roughness:{value:0},mipInt:{value:0}},vertexShader:pl(),fragmentShader:`

			precision highp float;
			precision highp int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform float roughness;
			uniform float mipInt;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			#define PI 3.14159265359

			// Van der Corput radical inverse
			float radicalInverse_VdC(uint bits) {
				bits = (bits << 16u) | (bits >> 16u);
				bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
				bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
				bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
				bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
				return float(bits) * 2.3283064365386963e-10; // / 0x100000000
			}

			// Hammersley sequence
			vec2 hammersley(uint i, uint N) {
				return vec2(float(i) / float(N), radicalInverse_VdC(i));
			}

			// GGX VNDF importance sampling (Eric Heitz 2018)
			// "Sampling the GGX Distribution of Visible Normals"
			// https://jcgt.org/published/0007/04/01/
			vec3 importanceSampleGGX_VNDF(vec2 Xi, vec3 V, float roughness) {
				float alpha = roughness * roughness;

				// Section 4.1: Orthonormal basis
				vec3 T1 = vec3(1.0, 0.0, 0.0);
				vec3 T2 = cross(V, T1);

				// Section 4.2: Parameterization of projected area
				float r = sqrt(Xi.x);
				float phi = 2.0 * PI * Xi.y;
				float t1 = r * cos(phi);
				float t2 = r * sin(phi);
				float s = 0.5 * (1.0 + V.z);
				t2 = (1.0 - s) * sqrt(1.0 - t1 * t1) + s * t2;

				// Section 4.3: Reprojection onto hemisphere
				vec3 Nh = t1 * T1 + t2 * T2 + sqrt(max(0.0, 1.0 - t1 * t1 - t2 * t2)) * V;

				// Section 3.4: Transform back to ellipsoid configuration
				return normalize(vec3(alpha * Nh.x, alpha * Nh.y, max(0.0, Nh.z)));
			}

			void main() {
				vec3 N = normalize(vOutputDirection);
				vec3 V = N; // Assume view direction equals normal for pre-filtering

				vec3 prefilteredColor = vec3(0.0);
				float totalWeight = 0.0;

				// For very low roughness, just sample the environment directly
				if (roughness < 0.001) {
					gl_FragColor = vec4(bilinearCubeUV(envMap, N, mipInt), 1.0);
					return;
				}

				// Tangent space basis for VNDF sampling
				vec3 up = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
				vec3 tangent = normalize(cross(up, N));
				vec3 bitangent = cross(N, tangent);

				for(uint i = 0u; i < uint(GGX_SAMPLES); i++) {
					vec2 Xi = hammersley(i, uint(GGX_SAMPLES));

					// For PMREM, V = N, so in tangent space V is always (0, 0, 1)
					vec3 H_tangent = importanceSampleGGX_VNDF(Xi, vec3(0.0, 0.0, 1.0), roughness);

					// Transform H back to world space
					vec3 H = normalize(tangent * H_tangent.x + bitangent * H_tangent.y + N * H_tangent.z);
					vec3 L = normalize(2.0 * dot(V, H) * H - V);

					float NdotL = max(dot(N, L), 0.0);

					if(NdotL > 0.0) {
						// Sample environment at fixed mip level
						// VNDF importance sampling handles the distribution filtering
						vec3 sampleColor = bilinearCubeUV(envMap, L, mipInt);

						// Weight by NdotL for the split-sum approximation
						// VNDF PDF naturally accounts for the visible microfacet distribution
						prefilteredColor += sampleColor * NdotL;
						totalWeight += NdotL;
					}
				}

				if (totalWeight > 0.0) {
					prefilteredColor = prefilteredColor / totalWeight;
				}

				gl_FragColor = vec4(prefilteredColor, 1.0);
			}
		`,blending:Bi,depthTest:!1,depthWrite:!1})}function v0(n,e,t){return new yi({name:"SphericalGaussianBlur",defines:{SAMPLES:m0,CUBEUV_TEXEL_WIDTH:1/e,CUBEUV_TEXEL_HEIGHT:1/t,CUBEUV_MAX_MIP:`${n}.0`},uniforms:{envMap:{value:null},sigma:{value:0},mipInt:{value:0}},vertexShader:pl(),fragmentShader:`

			precision highp float;
			precision highp int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform float sigma;
			uniform float mipInt;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			#define PI 3.14159265359
			#define GOLDEN_ANGLE 2.39996322973

			void main() {

				if ( sigma == 0.0 ) {

					gl_FragColor = vec4( bilinearCubeUV( envMap, vOutputDirection, mipInt ), 1.0 );
					return;

				}

				vec3 outputDirection = normalize( vOutputDirection );

				vec3 up = abs( outputDirection.z ) < 0.999 ? vec3( 0.0, 0.0, 1.0 ) : vec3( 1.0, 0.0, 0.0 );
				vec3 tangent = normalize( cross( up, outputDirection ) );
				vec3 bitangent = cross( outputDirection, tangent );

				// Truncate the kernel at three standard deviations or at the antipode.
				float thetaMax = min( 3.0 * sigma, PI );
				float truncation = 1.0 - exp( - 0.5 * thetaMax * thetaMax / ( sigma * sigma ) );

				vec3 accumColor = vec3( 0.0 );
				float accumWeight = 0.0;

				for ( int i = 0; i < SAMPLES; i ++ ) {

					// Stratified inverse-CDF sampling of the Gaussian, placed on a golden-angle spiral.
					float stratum = ( float( i ) + 0.5 ) / float( SAMPLES );
					float theta = sigma * sqrt( - 2.0 * log( 1.0 - stratum * truncation ) );
					float phi = float( i ) * GOLDEN_ANGLE;

					vec3 offset = cos( phi ) * tangent + sin( phi ) * bitangent;
					vec3 sampleDirection = cos( theta ) * outputDirection + sin( theta ) * offset;

					// Correct the planar sample density to solid angle.
					float weight = sin( theta ) / theta;

					accumColor += weight * bilinearCubeUV( envMap, sampleDirection, mipInt );
					accumWeight += weight;

				}

				gl_FragColor = vec4( accumColor / accumWeight, 1.0 );

			}
		`,blending:Bi,depthTest:!1,depthWrite:!1})}function jd(){return new yi({name:"EquirectangularToCubeUV",uniforms:{envMap:{value:null}},vertexShader:pl(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;

			#include <common>

			void main() {

				vec3 outputDirection = normalize( vOutputDirection );
				vec2 uv = equirectUv( outputDirection );

				gl_FragColor = vec4( texture2D ( envMap, uv ).rgb, 1.0 );

			}
		`,blending:Bi,depthTest:!1,depthWrite:!1})}function ep(){return new yi({name:"CubemapToCubeUV",uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:pl(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,blending:Bi,depthTest:!1,depthWrite:!1})}function pl(){return`

		precision mediump float;
		precision mediump int;

		attribute vec3 outputDirection;

		varying vec3 vOutputDirection;

		void main() {

			vOutputDirection = outputDirection;
			gl_Position = vec4( position, 1.0 );

		}
	`}var Fo=class extends _i{constructor(e=1,t={}){super(e,e,t),this.isWebGLCubeRenderTarget=!0;let i={width:e,height:e,depth:1},r=[i,i,i,i,i,i];this.texture=new wo(r),this._setTextureOptions(t),this.texture.isRenderTargetTexture=!0}fromEquirectangularTexture(e,t){this.texture.type=t.type,this.texture.colorSpace=t.colorSpace,this.texture.generateMipmaps=t.generateMipmaps,this.texture.minFilter=t.minFilter,this.texture.magFilter=t.magFilter;let i={uniforms:{tEquirect:{value:null}},vertexShader:`

				varying vec3 vWorldDirection;

				vec3 transformDirection( in vec3 dir, in mat4 matrix ) {

					return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );

				}

				void main() {

					vWorldDirection = transformDirection( position, modelMatrix );

					#include <begin_vertex>
					#include <project_vertex>

				}
			`,fragmentShader:`

				uniform sampler2D tEquirect;

				varying vec3 vWorldDirection;

				#include <common>

				void main() {

					vec3 direction = normalize( vWorldDirection );

					vec2 sampleUV = equirectUv( direction );

					gl_FragColor = texture2D( tEquirect, sampleUV );

				}
			`},r=new vi(5,5,5),o=new yi({name:"CubemapFromEquirect",uniforms:Bn(i.uniforms),vertexShader:i.vertexShader,fragmentShader:i.fragmentShader,side:Rt,blending:Bi});o.uniforms.tEquirect.value=t;let s=new We(r,o),a=t.minFilter;return t.minFilter===rn&&(t.minFilter=Bt),new hl(1,10,this).update(e,s),t.minFilter=a,s.geometry.dispose(),s.material.dispose(),this}clear(e,t=!0,i=!0,r=!0){let o=e.getRenderTarget();for(let s=0;s<6;s++)e.setRenderTarget(this,s),e.clear(t,i,r);e.setRenderTarget(o)}};function tp(n){let e=new WeakMap,t=new WeakMap,i=null;function r(u,d=!1){return u==null?null:d?s(u):o(u)}function o(u){if(u&&u.isTexture){let d=u.mapping;if(d===pa||d===ma)if(e.has(u)){let _=e.get(u).texture;return a(_,u.mapping)}else{let _=u.image;if(_&&_.height>0){let v=new Fo(_.height);return v.fromEquirectangularTexture(n,u),e.set(u,v),u.addEventListener("dispose",l),a(v.texture,u.mapping)}else return null}}return u}function s(u){if(u&&u.isTexture){let d=u.mapping,_=d===pa||d===ma,v=d===qi||d===Rn;if(_||v){let m=t.get(u),p=m!==void 0?m.texture.pmremVersion:0;if(u.isRenderTargetTexture&&u.pmremVersion!==p)return i===null&&(i=new lr(n)),m=_?i.fromEquirectangular(u,m):i.fromCubemap(u,m),m.texture.pmremVersion=u.pmremVersion,t.set(u,m),m.texture;if(m!==void 0)return m.texture;{let E=u.image;return _&&E&&E.height>0||v&&E&&c(E)?(i===null&&(i=new lr(n)),m=_?i.fromEquirectangular(u):i.fromCubemap(u),m.texture.pmremVersion=u.pmremVersion,t.set(u,m),u.addEventListener("dispose",f),m.texture):null}}}return u}function a(u,d){return d===pa?u.mapping=qi:d===ma&&(u.mapping=Rn),u}function c(u){let d=0,_=6;for(let v=0;v<_;v++)u[v]!==void 0&&d++;return d===_}function l(u){let d=u.target;d.removeEventListener("dispose",l);let _=e.get(d);_!==void 0&&(e.delete(d),_.dispose())}function f(u){let d=u.target;d.removeEventListener("dispose",f);let _=t.get(d);_!==void 0&&(t.delete(d),_.dispose())}function h(){e=new WeakMap,t=new WeakMap,i!==null&&(i.dispose(),i=null)}return{get:r,dispose:h}}function ip(n){let e={};function t(i){if(e[i]!==void 0)return e[i];let r=n.getExtension(i);return e[i]=r,r}return{has:function(i){return t(i)!==null},init:function(){t("EXT_color_buffer_float"),t("WEBGL_clip_cull_distance"),t("OES_texture_float_linear"),t("EXT_color_buffer_half_float"),t("WEBGL_multisampled_render_to_texture"),t("WEBGL_render_shared_exponent")},get:function(i){let r=t(i);return r===null&&xn("WebGLRenderer: "+i+" extension not supported."),r}}}function np(n,e,t,i){let r={},o=new WeakMap;function s(h){let u=h.target;u.index!==null&&e.remove(u.index);for(let _ in u.attributes)e.remove(u.attributes[_]);u.removeEventListener("dispose",s),delete r[u.id];let d=o.get(u);d&&(e.remove(d),o.delete(u)),i.releaseStatesOfGeometry(u),u.isInstancedBufferGeometry===!0&&delete u._maxInstanceCount,t.memory.geometries--}function a(h,u){return r[u.id]===!0||(u.addEventListener("dispose",s),r[u.id]=!0,t.memory.geometries++),u}function c(h){let u=h.attributes;for(let d in u)e.update(u[d],n.ARRAY_BUFFER)}function l(h){let u=[],d=h.index,_=h.attributes.position,v=0;if(_===void 0)return;if(d!==null){let E=d.array;v=d.version;for(let C=0,S=E.length;C<S;C+=3){let b=E[C+0],T=E[C+1],P=E[C+2];u.push(b,T,T,P,P,b)}}else{let E=_.array;v=_.version;for(let C=0,S=E.length/3-1;C<S;C+=3){let b=C+0,T=C+1,P=C+2;u.push(b,T,T,P,P,b)}}let m=new(_.count>=65535?vo:Mo)(u,1);m.version=v;let p=o.get(h);p&&e.remove(p),o.set(h,m)}function f(h){let u=o.get(h);if(u){let d=h.index;d!==null&&u.version<d.version&&l(h)}else l(h);return o.get(h)}return{get:a,update:c,getWireframeAttribute:f}}function rp(n,e,t){let i;function r(h){i=h}let o,s;function a(h){o=h.type,s=h.bytesPerElement}function c(h,u){n.drawElements(i,u,o,h*s),t.update(u,i,1)}function l(h,u,d){d!==0&&(n.drawElementsInstanced(i,u,o,h*s,d),t.update(u,i,d))}function f(h,u,d){if(d===0)return;e.get("WEBGL_multi_draw").multiDrawElementsWEBGL(i,u,0,o,h,0,d);let v=0;for(let m=0;m<d;m++)v+=u[m];t.update(v,i,1)}this.setMode=r,this.setIndex=a,this.render=c,this.renderInstances=l,this.renderMultiDraw=f}function op(n){let e={geometries:0,textures:0},t={frame:0,calls:0,triangles:0,points:0,lines:0};function i(o,s,a){switch(t.calls++,s){case n.TRIANGLES:t.triangles+=a*(o/3);break;case n.LINES:t.lines+=a*(o/2);break;case n.LINE_STRIP:t.lines+=a*(o-1);break;case n.LINE_LOOP:t.lines+=a*o;break;case n.POINTS:t.points+=a*o;break;default:Qe("WebGLInfo: Unknown draw mode:",s);break}}function r(){t.calls=0,t.triangles=0,t.points=0,t.lines=0}return{memory:e,render:t,programs:null,autoReset:!0,reset:r,update:i}}function sp(n,e,t){let i=new WeakMap,r=new At;function o(s,a,c){let l=s.morphTargetInfluences,f=a.morphAttributes.position||a.morphAttributes.normal||a.morphAttributes.color,h=f!==void 0?f.length:0,u=i.get(a);if(u===void 0||u.count!==h){let A=function(){P.dispose(),i.delete(a),a.removeEventListener("dispose",A)};u!==void 0&&u.texture.dispose();let d=a.morphAttributes.position!==void 0,_=a.morphAttributes.normal!==void 0,v=a.morphAttributes.color!==void 0,m=a.morphAttributes.position||[],p=a.morphAttributes.normal||[],E=a.morphAttributes.color||[],C=0;d===!0&&(C=1),_===!0&&(C=2),v===!0&&(C=3);let S=a.attributes.position.count*C,b=1;S>e.maxTextureSize&&(b=Math.ceil(S/e.maxTextureSize),S=e.maxTextureSize);let T=new Float32Array(S*b*4*h),P=new lo(T,S,b,h);P.type=Kt,P.needsUpdate=!0;let x=C*4;for(let D=0;D<h;D++){let G=m[D],z=p[D],Y=E[D],N=S*b*4*D;for(let F=0;F<G.count;F++){let te=F*x;d===!0&&(r.fromBufferAttribute(G,F),T[N+te+0]=r.x,T[N+te+1]=r.y,T[N+te+2]=r.z,T[N+te+3]=0),_===!0&&(r.fromBufferAttribute(z,F),T[N+te+4]=r.x,T[N+te+5]=r.y,T[N+te+6]=r.z,T[N+te+7]=0),v===!0&&(r.fromBufferAttribute(Y,F),T[N+te+8]=r.x,T[N+te+9]=r.y,T[N+te+10]=r.z,T[N+te+11]=Y.itemSize===4?r.w:1)}}u={count:h,texture:P,size:new Ne(S,b)},i.set(a,u),a.addEventListener("dispose",A)}if(s.isInstancedMesh===!0&&s.morphTexture!==null)c.getUniforms().setValue(n,"morphTexture",s.morphTexture,t);else{let d=0;for(let v=0;v<l.length;v++)d+=l[v];let _=a.morphTargetsRelative?1:1-d;c.getUniforms().setValue(n,"morphTargetBaseInfluence",_),c.getUniforms().setValue(n,"morphTargetInfluences",l)}c.getUniforms().setValue(n,"morphTargetsTexture",u.texture,t),c.getUniforms().setValue(n,"morphTargetsTextureSize",u.size)}return{update:o}}function ap(n,e,t,i,r){let o=new WeakMap;function s(l){let f=r.render.frame,h=l.geometry,u=e.get(l,h);if(o.get(u)!==f&&(e.update(u),o.set(u,f)),l.isInstancedMesh&&(l.hasEventListener("dispose",c)===!1&&l.addEventListener("dispose",c),o.get(l)!==f&&(t.update(l.instanceMatrix,n.ARRAY_BUFFER),l.instanceColor!==null&&t.update(l.instanceColor,n.ARRAY_BUFFER),o.set(l,f))),l.isSkinnedMesh){let d=l.skeleton;o.get(d)!==f&&(d.update(),o.set(d,f))}return u}function a(){o=new WeakMap}function c(l){let f=l.target;f.removeEventListener("dispose",c),i.releaseStatesOfObject(f),t.remove(f.instanceMatrix),f.instanceColor!==null&&t.remove(f.instanceColor)}return{update:s,dispose:a}}var S0={[la]:"LINEAR_TONE_MAPPING",[ca]:"REINHARD_TONE_MAPPING",[fa]:"CINEON_TONE_MAPPING",[Wr]:"ACES_FILMIC_TONE_MAPPING",[ha]:"AGX_TONE_MAPPING",[da]:"NEUTRAL_TONE_MAPPING",[ua]:"CUSTOM_TONE_MAPPING"};function lp(n,e,t,i,r,o){let s=new _i(e,t,{type:n,depthBuffer:r,stencilBuffer:o,samples:i?4:0,storeMultisampledDepthBuffer:!1,storeMultisampledStencilBuffer:!1,resolveDepthBuffer:!1,resolveStencilBuffer:!1}),a=null,c=null,l=new Ct;l.setAttribute("position",new gt([-1,3,0,-1,-1,0,3,-1,0],3)),l.setAttribute("uv",new gt([0,2,0,0,2,0],2));let f=new ol({uniforms:{tDiffuse:{value:null}},vertexShader:`
			precision highp float;

			uniform mat4 modelViewMatrix;
			uniform mat4 projectionMatrix;

			attribute vec3 position;
			attribute vec2 uv;

			varying vec2 vUv;

			void main() {
				vUv = uv;
				gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
			}`,fragmentShader:`
			precision highp float;

			uniform sampler2D tDiffuse;

			varying vec2 vUv;

			#include <tonemapping_pars_fragment>
			#include <colorspace_pars_fragment>

			void main() {
				gl_FragColor = texture2D( tDiffuse, vUv );

				#ifdef LINEAR_TONE_MAPPING
					gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );
				#elif defined( REINHARD_TONE_MAPPING )
					gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );
				#elif defined( CINEON_TONE_MAPPING )
					gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );
				#elif defined( ACES_FILMIC_TONE_MAPPING )
					gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );
				#elif defined( AGX_TONE_MAPPING )
					gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );
				#elif defined( NEUTRAL_TONE_MAPPING )
					gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );
				#elif defined( CUSTOM_TONE_MAPPING )
					gl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );
				#endif

				#ifdef SRGB_TRANSFER
					gl_FragColor = sRGBTransferOETF( gl_FragColor );
				#endif
			}`,depthTest:!1,depthWrite:!1}),h=new We(l,f),u=new ar(-1,1,1,-1,0,1),d=null,_=null,v=!1,m,p=null,E=[],C=!1;this.setSize=function(S,b){s.setSize(S,b),a!==null&&a.setSize(S,b),c!==null&&c.setSize(S,b);for(let T=0;T<E.length;T++){let P=E[T];P.setSize&&P.setSize(S,b)}},this.setEffects=function(S){E=S,C=E.length>0&&E[0].isRenderPass===!0;let b=s.width,T=s.height;E.length>0&&a===null&&(a=new _i(b,T,{type:jt,depthBuffer:!1,stencilBuffer:!1}),c=new _i(b,T,{type:jt,depthBuffer:!1,stencilBuffer:!1}));for(let P=0;P<E.length;P++){let x=E[P];x.setSize&&x.setSize(b,T)}},this.begin=function(S,b){if(v||S.toneMapping===Ri&&E.length===0)return!1;if(p=b,b!==null){let T=b.width,P=b.height;(s.width!==T||s.height!==P)&&this.setSize(T,P)}return C===!1&&S.setRenderTarget(s),m=S.toneMapping,S.toneMapping=Ri,!0},this.hasRenderPass=function(){return C},this.end=function(S,b){S.toneMapping=m,v=!0;let T=s,P=a;for(let x=0;x<E.length;x++){let A=E[x];A.enabled!==!1&&(A.render(S,P,T,b),A.needsSwap!==!1&&(T=P,P=P===a?c:a))}if(d!==S.outputColorSpace||_!==S.toneMapping){d=S.outputColorSpace,_=S.toneMapping,f.defines={},Ye.getTransfer(d)===st&&(f.defines.SRGB_TRANSFER="");let x=S0[_];x&&(f.defines[x]=""),f.needsUpdate=!0}f.uniforms.tDiffuse.value=T.texture,S.setRenderTarget(p),S.render(h,u),p=null,v=!1},this.isCompositing=function(){return v},this.dispose=function(){s.dispose(),a!==null&&a.dispose(),c!==null&&c.dispose(),l.dispose(),f.dispose()}}var mp=new kt,gc=new On(1,1),gp=new lo,_p=new Ra,xp=new wo,cp=[],fp=[],up=new Float32Array(16),hp=new Float32Array(9),dp=new Float32Array(4);function Uo(n,e,t){let i=n[0];if(i<=0||i>0)return n;let r=e*t,o=cp[r];if(o===void 0&&(o=new Float32Array(r),cp[r]=o),e!==0){i.toArray(o,0);for(let s=1,a=0;s!==e;++s)a+=t,n[s].toArray(o,a)}return o}function Jt(n,e){if(n.length!==e.length)return!1;for(let t=0,i=n.length;t<i;t++)if(n[t]!==e[t])return!1;return!0}function $t(n,e){for(let t=0,i=e.length;t<i;t++)n[t]=e[t]}function ml(n,e){let t=fp[e];t===void 0&&(t=new Int32Array(e),fp[e]=t);for(let i=0;i!==e;++i)t[i]=n.allocateTextureUnit();return t}function y0(n,e){let t=this.cache;t[0]!==e&&(n.uniform1f(this.addr,e),t[0]=e)}function E0(n,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(n.uniform2f(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(Jt(t,e))return;n.uniform2fv(this.addr,e),$t(t,e)}}function b0(n,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(n.uniform3f(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else if(e.r!==void 0)(t[0]!==e.r||t[1]!==e.g||t[2]!==e.b)&&(n.uniform3f(this.addr,e.r,e.g,e.b),t[0]=e.r,t[1]=e.g,t[2]=e.b);else{if(Jt(t,e))return;n.uniform3fv(this.addr,e),$t(t,e)}}function T0(n,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(n.uniform4f(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(Jt(t,e))return;n.uniform4fv(this.addr,e),$t(t,e)}}function A0(n,e){let t=this.cache,i=e.elements;if(i===void 0){if(Jt(t,e))return;n.uniformMatrix2fv(this.addr,!1,e),$t(t,e)}else{if(Jt(t,i))return;dp.set(i),n.uniformMatrix2fv(this.addr,!1,dp),$t(t,i)}}function w0(n,e){let t=this.cache,i=e.elements;if(i===void 0){if(Jt(t,e))return;n.uniformMatrix3fv(this.addr,!1,e),$t(t,e)}else{if(Jt(t,i))return;hp.set(i),n.uniformMatrix3fv(this.addr,!1,hp),$t(t,i)}}function R0(n,e){let t=this.cache,i=e.elements;if(i===void 0){if(Jt(t,e))return;n.uniformMatrix4fv(this.addr,!1,e),$t(t,e)}else{if(Jt(t,i))return;up.set(i),n.uniformMatrix4fv(this.addr,!1,up),$t(t,i)}}function C0(n,e){let t=this.cache;t[0]!==e&&(n.uniform1i(this.addr,e),t[0]=e)}function P0(n,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(n.uniform2i(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(Jt(t,e))return;n.uniform2iv(this.addr,e),$t(t,e)}}function L0(n,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(n.uniform3i(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else{if(Jt(t,e))return;n.uniform3iv(this.addr,e),$t(t,e)}}function D0(n,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(n.uniform4i(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(Jt(t,e))return;n.uniform4iv(this.addr,e),$t(t,e)}}function I0(n,e){let t=this.cache;t[0]!==e&&(n.uniform1ui(this.addr,e),t[0]=e)}function F0(n,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(n.uniform2ui(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(Jt(t,e))return;n.uniform2uiv(this.addr,e),$t(t,e)}}function U0(n,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(n.uniform3ui(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else{if(Jt(t,e))return;n.uniform3uiv(this.addr,e),$t(t,e)}}function N0(n,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(n.uniform4ui(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(Jt(t,e))return;n.uniform4uiv(this.addr,e),$t(t,e)}}function O0(n,e,t){let i=this.cache,r=t.allocateTextureUnit();i[0]!==r&&(n.uniform1i(this.addr,r),i[0]=r);let o;this.type===n.SAMPLER_2D_SHADOW?(gc.compareFunction=t.isReversedDepthBuffer()?no:io,o=gc):o=mp,t.setTexture2D(e||o,r)}function B0(n,e,t){let i=this.cache,r=t.allocateTextureUnit();i[0]!==r&&(n.uniform1i(this.addr,r),i[0]=r),t.setTexture3D(e||_p,r)}function G0(n,e,t){let i=this.cache,r=t.allocateTextureUnit();i[0]!==r&&(n.uniform1i(this.addr,r),i[0]=r),t.setTextureCube(e||xp,r)}function z0(n,e,t){let i=this.cache,r=t.allocateTextureUnit();i[0]!==r&&(n.uniform1i(this.addr,r),i[0]=r),t.setTexture2DArray(e||gp,r)}function V0(n){switch(n){case 5126:return y0;case 35664:return E0;case 35665:return b0;case 35666:return T0;case 35674:return A0;case 35675:return w0;case 35676:return R0;case 5124:case 35670:return C0;case 35667:case 35671:return P0;case 35668:case 35672:return L0;case 35669:case 35673:return D0;case 5125:return I0;case 36294:return F0;case 36295:return U0;case 36296:return N0;case 35678:case 36198:case 36298:case 36306:case 35682:return O0;case 35679:case 36299:case 36307:return B0;case 35680:case 36300:case 36308:case 36293:return G0;case 36289:case 36303:case 36311:case 36292:return z0}}function H0(n,e){n.uniform1fv(this.addr,e)}function k0(n,e){let t=Uo(e,this.size,2);n.uniform2fv(this.addr,t)}function W0(n,e){let t=Uo(e,this.size,3);n.uniform3fv(this.addr,t)}function X0(n,e){let t=Uo(e,this.size,4);n.uniform4fv(this.addr,t)}function q0(n,e){let t=Uo(e,this.size,4);n.uniformMatrix2fv(this.addr,!1,t)}function Y0(n,e){let t=Uo(e,this.size,9);n.uniformMatrix3fv(this.addr,!1,t)}function Z0(n,e){let t=Uo(e,this.size,16);n.uniformMatrix4fv(this.addr,!1,t)}function K0(n,e){n.uniform1iv(this.addr,e)}function J0(n,e){n.uniform2iv(this.addr,e)}function $0(n,e){n.uniform3iv(this.addr,e)}function Q0(n,e){n.uniform4iv(this.addr,e)}function j0(n,e){n.uniform1uiv(this.addr,e)}function eg(n,e){n.uniform2uiv(this.addr,e)}function tg(n,e){n.uniform3uiv(this.addr,e)}function ig(n,e){n.uniform4uiv(this.addr,e)}function ng(n,e,t){let i=this.cache,r=e.length,o=ml(t,r);Jt(i,o)||(n.uniform1iv(this.addr,o),$t(i,o));let s;this.type===n.SAMPLER_2D_SHADOW?s=gc:s=mp;for(let a=0;a!==r;++a)t.setTexture2D(e[a]||s,o[a])}function rg(n,e,t){let i=this.cache,r=e.length,o=ml(t,r);Jt(i,o)||(n.uniform1iv(this.addr,o),$t(i,o));for(let s=0;s!==r;++s)t.setTexture3D(e[s]||_p,o[s])}function og(n,e,t){let i=this.cache,r=e.length,o=ml(t,r);Jt(i,o)||(n.uniform1iv(this.addr,o),$t(i,o));for(let s=0;s!==r;++s)t.setTextureCube(e[s]||xp,o[s])}function sg(n,e,t){let i=this.cache,r=e.length,o=ml(t,r);Jt(i,o)||(n.uniform1iv(this.addr,o),$t(i,o));for(let s=0;s!==r;++s)t.setTexture2DArray(e[s]||gp,o[s])}function ag(n){switch(n){case 5126:return H0;case 35664:return k0;case 35665:return W0;case 35666:return X0;case 35674:return q0;case 35675:return Y0;case 35676:return Z0;case 5124:case 35670:return K0;case 35667:case 35671:return J0;case 35668:case 35672:return $0;case 35669:case 35673:return Q0;case 5125:return j0;case 36294:return eg;case 36295:return tg;case 36296:return ig;case 35678:case 36198:case 36298:case 36306:case 35682:return ng;case 35679:case 36299:case 36307:return rg;case 35680:case 36300:case 36308:case 36293:return og;case 36289:case 36303:case 36311:case 36292:return sg}}var _c=class{constructor(e,t,i){this.id=e,this.addr=i,this.cache=[],this.type=t.type,this.setValue=V0(t.type)}},xc=class{constructor(e,t,i){this.id=e,this.addr=i,this.cache=[],this.type=t.type,this.size=t.size,this.setValue=ag(t.type)}},Mc=class{constructor(e){this.id=e,this.seq=[],this.map={}}setValue(e,t,i){let r=this.seq;for(let o=0,s=r.length;o!==s;++o){let a=r[o];a.setValue(e,t[a.id],i)}}},mc=/(\w+)(\])?(\[|\.)?/g;function pp(n,e){n.seq.push(e),n.map[e.id]=e}function lg(n,e,t){let i=n.name,r=i.length;for(mc.lastIndex=0;;){let o=mc.exec(i),s=mc.lastIndex,a=o[1],c=o[2]==="]",l=o[3];if(c&&(a=a|0),l===void 0||l==="["&&s+2===r){pp(t,l===void 0?new _c(a,n,e):new xc(a,n,e));break}else{let h=t.map[a];h===void 0&&(h=new Mc(a),pp(t,h)),t=h}}}var cr=class{constructor(e,t){this.seq=[],this.map={};let i=e.getProgramParameter(t,e.ACTIVE_UNIFORMS);for(let s=0;s<i;++s){let a=e.getActiveUniform(t,s),c=e.getUniformLocation(t,a.name);lg(a,c,this)}let r=[],o=[];for(let s of this.seq)s.type===e.SAMPLER_2D_SHADOW||s.type===e.SAMPLER_CUBE_SHADOW||s.type===e.SAMPLER_2D_ARRAY_SHADOW?r.push(s):o.push(s);r.length>0&&(this.seq=r.concat(o))}setValue(e,t,i,r){let o=this.map[t];o!==void 0&&o.setValue(e,i,r)}setOptional(e,t,i){let r=t[i];r!==void 0&&this.setValue(e,i,r)}static upload(e,t,i,r){for(let o=0,s=t.length;o!==s;++o){let a=t[o],c=i[a.id];c.needsUpdate!==!1&&a.setValue(e,c.value,r)}}static seqWithValue(e,t){let i=[];for(let r=0,o=e.length;r!==o;++r){let s=e[r];s.id in t&&i.push(s)}return i}};function vc(n,e,t){let i=n.createShader(e);return n.shaderSource(i,t),n.compileShader(i),i}var cg=37297,fg=0;function ug(n,e){let t=n.split(`
`),i=[],r=Math.max(e-6,0),o=Math.min(e+6,t.length);for(let s=r;s<o;s++){let a=s+1;i.push(`${a===e?">":" "} ${a}: ${t[s]}`)}return i.join(`
`)}var Mp=new Be;function hg(n){Ye._getMatrix(Mp,Ye.workingColorSpace,n);let e=`mat3( ${Mp.elements.map(t=>t.toFixed(4))} )`;switch(Ye.getTransfer(n)){case br:return[e,"LinearTransferOETF"];case st:return[e,"sRGBTransferOETF"];default:return Re("WebGLProgram: Unsupported color space: ",n),[e,"LinearTransferOETF"]}}function vp(n,e,t){let i=n.getShaderParameter(e,n.COMPILE_STATUS),o=(n.getShaderInfoLog(e)||"").trim();if(i&&o==="")return"";let s=/ERROR: 0:(\d+)/.exec(o);if(s){let a=parseInt(s[1]);return t.toUpperCase()+`

`+o+`

`+ug(n.getShaderSource(e),a)}else return o}function dg(n,e){let t=hg(e);return[`vec4 ${n}( vec4 value ) {`,`	return ${t[1]}( vec4( value.rgb * ${t[0]}, value.a ) );`,"}"].join(`
`)}var pg={[la]:"Linear",[ca]:"Reinhard",[fa]:"Cineon",[Wr]:"ACESFilmic",[ha]:"AgX",[da]:"Neutral",[ua]:"Custom"};function mg(n,e){let t=pg[e];return t===void 0?(Re("WebGLProgram: Unsupported toneMapping:",e),"vec3 "+n+"( vec3 color ) { return LinearToneMapping( color ); }"):"vec3 "+n+"( vec3 color ) { return "+t+"ToneMapping( color ); }"}var gl=new L;function gg(){Ye.getLuminanceCoefficients(gl);let n=gl.x.toFixed(4),e=gl.y.toFixed(4),t=gl.z.toFixed(4);return["float luminance( const in vec3 rgb ) {",`	const vec3 weights = vec3( ${n}, ${e}, ${t} );`,"	return dot( weights, rgb );","}"].join(`
`)}function _g(n){return[n.extensionClipCullDistance?"#extension GL_ANGLE_clip_cull_distance : require":"",n.extensionMultiDraw?"#extension GL_ANGLE_multi_draw : require":""].filter(Zs).join(`
`)}function xg(n){let e=[];for(let t in n){let i=n[t];i!==!1&&e.push("#define "+t+" "+i)}return e.join(`
`)}function Mg(n,e){let t={},i=n.getProgramParameter(e,n.ACTIVE_ATTRIBUTES);for(let r=0;r<i;r++){let o=n.getActiveAttrib(e,r),s=o.name,a=1;o.type===n.FLOAT_MAT2&&(a=2),o.type===n.FLOAT_MAT3&&(a=3),o.type===n.FLOAT_MAT4&&(a=4),t[s]={type:o.type,location:n.getAttribLocation(e,s),locationSize:a}}return t}function Zs(n){return n!==""}function Sp(n,e){let t=e.numSpotLightShadows+e.numSpotLightMaps-e.numSpotLightShadowsWithMaps;return n.replace(/NUM_SUN_LIGHTS/g,e.numSunLights).replace(/NUM_DIR_LIGHTS/g,e.numDirLights).replace(/NUM_SPOT_LIGHTS/g,e.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,e.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,t).replace(/NUM_RECT_AREA_LIGHTS/g,e.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,e.numPointLights).replace(/NUM_HEMI_LIGHTS/g,e.numHemiLights).replace(/NUM_SUN_LIGHT_SHADOWS/g,e.numSunLightShadows).replace(/NUM_DIR_LIGHT_SHADOWS/g,e.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,e.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,e.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,e.numPointLightShadows)}function yp(n,e){return n.replace(/NUM_CLIPPING_PLANES/g,e.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,e.numClippingPlanes-e.numClipIntersection)}var vg=/^[ \t]*#include +<([\w\d./]+)>/gm;function Sc(n){return n.replace(vg,yg)}var Sg=new Map;function yg(n,e){let t=Ke[e];if(t===void 0){let i=Sg.get(e);if(i!==void 0)t=Ke[i],Re('WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.',e,i);else throw new Error("THREE.WebGLProgram: Can not resolve #include <"+e+">")}return Sc(t)}var Eg=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function Ep(n){return n.replace(Eg,bg)}function bg(n,e,t,i){let r="";for(let o=parseInt(e);o<parseInt(t);o++)r+=i.replace(/\[\s*i\s*\]/g,"[ "+o+" ]").replace(/UNROLLED_LOOP_INDEX/g,o);return r}function bp(n){let e=`precision ${n.precision} float;
	precision ${n.precision} int;
	precision ${n.precision} sampler2D;
	precision ${n.precision} samplerCube;
	precision ${n.precision} sampler3D;
	precision ${n.precision} sampler2DArray;
	precision ${n.precision} sampler2DShadow;
	precision ${n.precision} samplerCubeShadow;
	precision ${n.precision} sampler2DArrayShadow;
	precision ${n.precision} isampler2D;
	precision ${n.precision} isampler3D;
	precision ${n.precision} isamplerCube;
	precision ${n.precision} isampler2DArray;
	precision ${n.precision} usampler2D;
	precision ${n.precision} usampler3D;
	precision ${n.precision} usamplerCube;
	precision ${n.precision} usampler2DArray;
	`;return n.precision==="highp"?e+=`
#define HIGH_PRECISION`:n.precision==="mediump"?e+=`
#define MEDIUM_PRECISION`:n.precision==="lowp"&&(e+=`
#define LOW_PRECISION`),e}var Tg={[Yn]:"SHADOWMAP_TYPE_PCF",[_r]:"SHADOWMAP_TYPE_VSM"};function Ag(n){return Tg[n.shadowMapType]||"SHADOWMAP_TYPE_BASIC"}var wg={[qi]:"ENVMAP_TYPE_CUBE",[Rn]:"ENVMAP_TYPE_CUBE",[$n]:"ENVMAP_TYPE_CUBE_UV"};function Rg(n){return n.envMap===!1?"ENVMAP_TYPE_CUBE":wg[n.envMapMode]||"ENVMAP_TYPE_CUBE"}var Cg={[Rn]:"ENVMAP_MODE_REFRACTION"};function Pg(n){return n.envMap===!1?"ENVMAP_MODE_REFLECTION":Cg[n.envMapMode]||"ENVMAP_MODE_REFLECTION"}var Lg={[kr]:"ENVMAP_BLENDING_MULTIPLY",[uf]:"ENVMAP_BLENDING_MIX",[hf]:"ENVMAP_BLENDING_ADD"};function Dg(n){return n.envMap===!1?"ENVMAP_BLENDING_NONE":Lg[n.combine]||"ENVMAP_BLENDING_NONE"}function Ig(n){let e=n.envMapCubeUVHeight;if(e===null)return null;let t=Math.log2(e)-2,i=1/e;return{texelWidth:1/(3*Math.max(Math.pow(2,t),7*16)),texelHeight:i,maxMip:t}}function Tp(n,e,t,i){let r=n.getContext(),o=t.defines,s=t.vertexShader,a=t.fragmentShader,c=Ag(t),l=Rg(t),f=Pg(t),h=Dg(t),u=Ig(t),d=_g(t),_=xg(o),v=r.createProgram(),m,p,E=t.glslVersion?"#version "+t.glslVersion+`
`:"";t.isRawShaderMaterial?(m=["#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,_].filter(Zs).join(`
`),m.length>0&&(m+=`
`),p=["#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,_].filter(Zs).join(`
`),p.length>0&&(p+=`
`)):(m=[bp(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,_,t.extensionClipCullDistance?"#define USE_CLIP_DISTANCE":"",t.batching?"#define USE_BATCHING":"",t.batchingColor?"#define USE_BATCHING_COLOR":"",t.instancing?"#define USE_INSTANCING":"",t.instancingColor?"#define USE_INSTANCING_COLOR":"",t.instancingMorph?"#define USE_INSTANCING_MORPH":"",t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.map?"#define USE_MAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+f:"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.displacementMap?"#define USE_DISPLACEMENTMAP":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.mapUv?"#define MAP_UV "+t.mapUv:"",t.alphaMapUv?"#define ALPHAMAP_UV "+t.alphaMapUv:"",t.lightMapUv?"#define LIGHTMAP_UV "+t.lightMapUv:"",t.aoMapUv?"#define AOMAP_UV "+t.aoMapUv:"",t.emissiveMapUv?"#define EMISSIVEMAP_UV "+t.emissiveMapUv:"",t.bumpMapUv?"#define BUMPMAP_UV "+t.bumpMapUv:"",t.normalMapUv?"#define NORMALMAP_UV "+t.normalMapUv:"",t.displacementMapUv?"#define DISPLACEMENTMAP_UV "+t.displacementMapUv:"",t.metalnessMapUv?"#define METALNESSMAP_UV "+t.metalnessMapUv:"",t.roughnessMapUv?"#define ROUGHNESSMAP_UV "+t.roughnessMapUv:"",t.anisotropyMapUv?"#define ANISOTROPYMAP_UV "+t.anisotropyMapUv:"",t.clearcoatMapUv?"#define CLEARCOATMAP_UV "+t.clearcoatMapUv:"",t.clearcoatNormalMapUv?"#define CLEARCOAT_NORMALMAP_UV "+t.clearcoatNormalMapUv:"",t.clearcoatRoughnessMapUv?"#define CLEARCOAT_ROUGHNESSMAP_UV "+t.clearcoatRoughnessMapUv:"",t.iridescenceMapUv?"#define IRIDESCENCEMAP_UV "+t.iridescenceMapUv:"",t.iridescenceThicknessMapUv?"#define IRIDESCENCE_THICKNESSMAP_UV "+t.iridescenceThicknessMapUv:"",t.sheenColorMapUv?"#define SHEEN_COLORMAP_UV "+t.sheenColorMapUv:"",t.sheenRoughnessMapUv?"#define SHEEN_ROUGHNESSMAP_UV "+t.sheenRoughnessMapUv:"",t.specularMapUv?"#define SPECULARMAP_UV "+t.specularMapUv:"",t.specularColorMapUv?"#define SPECULAR_COLORMAP_UV "+t.specularColorMapUv:"",t.specularIntensityMapUv?"#define SPECULAR_INTENSITYMAP_UV "+t.specularIntensityMapUv:"",t.transmissionMapUv?"#define TRANSMISSIONMAP_UV "+t.transmissionMapUv:"",t.thicknessMapUv?"#define THICKNESSMAP_UV "+t.thicknessMapUv:"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexNormals?"#define HAS_NORMAL":"",t.vertexColors?"#define USE_COLOR":"",t.vertexAlphas?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.flatShading?"#define FLAT_SHADED":"",t.skinning?"#define USE_SKINNING":"",t.morphTargets?"#define USE_MORPHTARGETS":"",t.morphNormals&&t.flatShading===!1?"#define USE_MORPHNORMALS":"",t.morphColors?"#define USE_MORPHCOLORS":"",t.morphTargetsCount>0?"#define MORPHTARGETS_TEXTURE_STRIDE "+t.morphTextureStride:"",t.morphTargetsCount>0?"#define MORPHTARGETS_COUNT "+t.morphTargetsCount:"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+c:"",t.sizeAttenuation?"#define USE_SIZEATTENUATION":"",t.numLightProbes>0?"#define USE_LIGHT_PROBES":"",t.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",t.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 modelMatrix;","uniform mat4 modelViewMatrix;","uniform mat4 projectionMatrix;","uniform mat4 viewMatrix;","uniform mat3 normalMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;","#ifdef USE_INSTANCING","	attribute mat4 instanceMatrix;","#endif","#ifdef USE_INSTANCING_COLOR","	attribute vec3 instanceColor;","#endif","#ifdef USE_INSTANCING_MORPH","	uniform sampler2D morphTexture;","#endif","attribute vec3 position;","attribute vec3 normal;","attribute vec2 uv;","#ifdef USE_UV1","	attribute vec2 uv1;","#endif","#ifdef USE_UV2","	attribute vec2 uv2;","#endif","#ifdef USE_UV3","	attribute vec2 uv3;","#endif","#ifdef USE_TANGENT","	attribute vec4 tangent;","#endif","#if defined( USE_COLOR_ALPHA )","	attribute vec4 color;","#elif defined( USE_COLOR )","	attribute vec3 color;","#endif","#ifdef USE_SKINNING","	attribute vec4 skinIndex;","	attribute vec4 skinWeight;","#endif",`
`].filter(Zs).join(`
`),p=[bp(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,_,t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.alphaToCoverage?"#define ALPHA_TO_COVERAGE":"",t.map?"#define USE_MAP":"",t.matcap?"#define USE_MATCAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+l:"",t.envMap?"#define "+f:"",t.envMap?"#define "+h:"",u?"#define CUBEUV_TEXEL_WIDTH "+u.texelWidth:"",u?"#define CUBEUV_TEXEL_HEIGHT "+u.texelHeight:"",u?"#define CUBEUV_MAX_MIP "+u.maxMip+".0":"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.packedNormalMap?"#define USE_PACKED_NORMALMAP":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoat?"#define USE_CLEARCOAT":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.dispersion?"#define USE_DISPERSION":"",t.retroreflection?"#define USE_RETROREFLECTION":"",t.iridescence?"#define USE_IRIDESCENCE":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaTest?"#define USE_ALPHATEST":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.sheen?"#define USE_SHEEN":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexColors||t.instancingColor?"#define USE_COLOR":"",t.vertexAlphas||t.batchingColor?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.gradientMap?"#define USE_GRADIENTMAP":"",t.flatShading?"#define FLAT_SHADED":"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+c:"",t.premultipliedAlpha?"#define PREMULTIPLIED_ALPHA":"",t.numLightProbes>0?"#define USE_LIGHT_PROBES":"",t.numLightProbeGrids>0?"#define USE_LIGHT_PROBES_GRID":"",t.decodeVideoTexture?"#define DECODE_VIDEO_TEXTURE":"",t.decodeVideoTextureEmissive?"#define DECODE_VIDEO_TEXTURE_EMISSIVE":"",t.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",t.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 viewMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;",t.toneMapping!==Ri?"#define TONE_MAPPING":"",t.toneMapping!==Ri?Ke.tonemapping_pars_fragment:"",t.toneMapping!==Ri?mg("toneMapping",t.toneMapping):"",t.dithering?"#define DITHERING":"",t.opaque?"#define OPAQUE":"",Ke.colorspace_pars_fragment,dg("linearToOutputTexel",t.outputColorSpace),gg(),t.useDepthPacking?"#define DEPTH_PACKING "+t.depthPacking:"",`
`].filter(Zs).join(`
`)),s=Sc(s),s=Sp(s,t),s=yp(s,t),a=Sc(a),a=Sp(a,t),a=yp(a,t),s=Ep(s),a=Ep(a),t.isRawShaderMaterial!==!0&&(E=`#version 300 es
`,m=[d,"#define attribute in","#define varying out","#define texture2D texture"].join(`
`)+`
`+m,p=["#define varying in",t.glslVersion===Il?"":"layout(location = 0) out highp vec4 pc_fragColor;",t.glslVersion===Il?"":"#define gl_FragColor pc_fragColor","#define gl_FragDepthEXT gl_FragDepth","#define texture2D texture","#define textureCube texture","#define texture2DProj textureProj","#define texture2DLodEXT textureLod","#define texture2DProjLodEXT textureProjLod","#define textureCubeLodEXT textureLod","#define texture2DGradEXT textureGrad","#define texture2DProjGradEXT textureProjGrad","#define textureCubeGradEXT textureGrad"].join(`
`)+`
`+p);let C=E+m+s,S=E+p+a,b=vc(r,r.VERTEX_SHADER,C),T=vc(r,r.FRAGMENT_SHADER,S);r.attachShader(v,b),r.attachShader(v,T),t.index0AttributeName!==void 0?r.bindAttribLocation(v,0,t.index0AttributeName):t.hasPositionAttribute===!0&&r.bindAttribLocation(v,0,"position"),r.linkProgram(v);function P(G){if(n.debug.checkShaderErrors){let z=r.getProgramInfoLog(v)||"",Y=r.getShaderInfoLog(b)||"",N=r.getShaderInfoLog(T)||"",F=z.trim(),te=Y.trim(),$=N.trim(),ae=!0,j=!0;if(r.getProgramParameter(v,r.LINK_STATUS)===!1)if(ae=!1,typeof n.debug.onShaderError=="function")n.debug.onShaderError(r,v,b,T);else{let re=vp(r,b,"vertex"),oe=vp(r,T,"fragment");Qe("WebGLProgram: Shader Error "+r.getError()+" - VALIDATE_STATUS "+r.getProgramParameter(v,r.VALIDATE_STATUS)+`

Material Name: `+G.name+`
Material Type: `+G.type+`

Program Info Log: `+F+`
`+re+`
`+oe)}else F!==""?Re("WebGLProgram: Program Info Log:",F):(te===""||$==="")&&(j=!1);j&&(G.diagnostics={runnable:ae,programLog:F,vertexShader:{log:te,prefix:m},fragmentShader:{log:$,prefix:p}})}r.deleteShader(b),r.deleteShader(T),x=new cr(r,v),A=Mg(r,v)}let x;this.getUniforms=function(){return x===void 0&&P(this),x};let A;this.getAttributes=function(){return A===void 0&&P(this),A};let D=t.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return D===!1&&(D=r.getProgramParameter(v,cg)),D},this.destroy=function(){i.releaseStatesOfProgram(this),r.deleteProgram(v),this.program=void 0},this.type=t.shaderType,this.name=t.shaderName,this.id=fg++,this.cacheKey=e,this.usedTimes=1,this.program=v,this.vertexShader=b,this.fragmentShader=T,this}var Fg=0,_l=class{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(e,t,i){let r=this._getShaderCacheForMaterial(e);return r.has(t)===!1&&(r.add(t),t.usedTimes++),r.has(i)===!1&&(r.add(i),i.usedTimes++),this}remove(e){let t=this.materialCache.get(e);for(let i of t)i.usedTimes--,i.usedTimes===0&&this.shaderCache.delete(i.code);return this.materialCache.delete(e),this}getVertexShaderStage(e){return this._getShaderStage(e.vertexShader)}getFragmentShaderStage(e){return this._getShaderStage(e.fragmentShader)}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(e){let t=this.materialCache,i=t.get(e);return i===void 0&&(i=new Set,t.set(e,i)),i}_getShaderStage(e){let t=this.shaderCache,i=t.get(e);return i===void 0&&(i=new yc(e),t.set(e,i)),i}},yc=class{constructor(e){this.id=Fg++,this.code=e,this.usedTimes=0}};function Ug(n){return n===zi||n===vr||n===Sr}function Ap(n,e,t,i,r,o){let s=new fo,a=new _l,c=new Set,l=[],f=new Map,h=i.logarithmicDepthBuffer,u=i.precision,d={MeshDepthMaterial:"depth",MeshDistanceMaterial:"distance",MeshNormalMaterial:"normal",MeshBasicMaterial:"basic",MeshLambertMaterial:"lambert",MeshPhongMaterial:"phong",MeshToonMaterial:"toon",MeshStandardMaterial:"physical",MeshPhysicalMaterial:"physical",MeshMatcapMaterial:"matcap",LineBasicMaterial:"basic",LineDashedMaterial:"dashed",PointsMaterial:"points",ShadowMaterial:"shadow",SpriteMaterial:"sprite"};function _(x){return c.add(x),x===0?"uv":`uv${x}`}function v(x,A,D,G,z,Y){let N=G.fog,F=z.geometry,te=x.isMeshStandardMaterial||x.isMeshLambertMaterial||x.isMeshPhongMaterial?G.environment:null,$=x.isMeshStandardMaterial||x.isMeshLambertMaterial&&!x.envMap||x.isMeshPhongMaterial&&!x.envMap,ae=e.get(x.envMap||te,$),j=ae&&ae.mapping===$n?ae.image.height:null,re=d[x.type];x.precision!==null&&(u=i.getMaxPrecision(x.precision),u!==x.precision&&Re("WebGLProgram.getParameters:",x.precision,"not supported, using",u,"instead."));let oe=F.morphAttributes.position||F.morphAttributes.normal||F.morphAttributes.color,Ge=oe!==void 0?oe.length:0,Oe=0;F.morphAttributes.position!==void 0&&(Oe=1),F.morphAttributes.normal!==void 0&&(Oe=2),F.morphAttributes.color!==void 0&&(Oe=3);let Dt,at,ct,xt;if(re){let ot=Qi[re];Dt=ot.vertexShader,at=ot.fragmentShader}else{Dt=x.vertexShader,at=x.fragmentShader;let ot=a.getVertexShaderStage(x),tt=a.getFragmentShaderStage(x);a.update(x,ot,tt),ct=ot.id,xt=tt.id}let ye=n.getRenderTarget(),pt=n.state.buffers.depth.getReversed(),Gt=z.isInstancedMesh===!0,Ie=z.isBatchedMesh===!0,Et=!!x.map,ci=!!x.matcap,si=!!ae,zt=!!x.aoMap,bi=!!x.lightMap,Di=!!x.bumpMap&&x.wireframe===!1,Yt=!!x.normalMap,Wt=!!x.displacementMap,fi=!!x.emissiveMap,Xt=!!x.metalnessMap,Ht=!!x.roughnessMap,B=x.anisotropy>0,ui=x.clearcoat>0,vt=x.dispersion>0,w=x.retroreflectivity>0,g=x.iridescence>0,H=x.sheen>0,q=x.transmission>0,Z=B&&!!x.anisotropyMap,ue=ui&&!!x.clearcoatMap,ge=ui&&!!x.clearcoatNormalMap,Q=ui&&!!x.clearcoatRoughnessMap,ie=g&&!!x.iridescenceMap,pe=g&&!!x.iridescenceThicknessMap,Fe=H&&!!x.sheenColorMap,_e=H&&!!x.sheenRoughnessMap,de=!!x.specularMap,Ue=!!x.specularColorMap,ze=!!x.specularIntensityMap,ke=q&&!!x.transmissionMap,O=q&&!!x.thicknessMap,me=!!x.gradientMap,ee=!!x.alphaMap,he=x.alphaTest>0,Se=!!x.alphaHash,se=!!x.extensions,Ce=Ri;x.toneMapped&&(ye===null||ye.isXRRenderTarget===!0)&&(Ce=n.toneMapping);let Le={shaderID:re,shaderType:x.type,shaderName:x.name,vertexShader:Dt,fragmentShader:at,defines:x.defines,customVertexShaderID:ct,customFragmentShaderID:xt,isRawShaderMaterial:x.isRawShaderMaterial===!0,glslVersion:x.glslVersion,precision:u,batching:Ie,batchingColor:Ie&&z._colorsTexture!==null,instancing:Gt,instancingColor:Gt&&z.instanceColor!==null,instancingMorph:Gt&&z.morphTexture!==null,outputColorSpace:ye===null?n.outputColorSpace:ye.isXRRenderTarget===!0?ye.texture.colorSpace:Ye.workingColorSpace,alphaToCoverage:!!x.alphaToCoverage,map:Et,matcap:ci,envMap:si,envMapMode:si&&ae.mapping,envMapCubeUVHeight:j,aoMap:zt,lightMap:bi,bumpMap:Di,normalMap:Yt,displacementMap:Wt,emissiveMap:fi,normalMapObjectSpace:Yt&&x.normalMapType===mf,normalMapTangentSpace:Yt&&x.normalMapType===yr,packedNormalMap:Yt&&x.normalMapType===yr&&Ug(x.normalMap.format),metalnessMap:Xt,roughnessMap:Ht,anisotropy:B,anisotropyMap:Z,clearcoat:ui,clearcoatMap:ue,clearcoatNormalMap:ge,clearcoatRoughnessMap:Q,dispersion:vt,retroreflection:w,iridescence:g,iridescenceMap:ie,iridescenceThicknessMap:pe,sheen:H,sheenColorMap:Fe,sheenRoughnessMap:_e,specularMap:de,specularColorMap:Ue,specularIntensityMap:ze,transmission:q,transmissionMap:ke,thicknessMap:O,gradientMap:me,opaque:x.transparent===!1&&x.blending===Zn&&x.alphaToCoverage===!1,alphaMap:ee,alphaTest:he,alphaHash:Se,combine:x.combine,mapUv:Et&&_(x.map.channel),aoMapUv:zt&&_(x.aoMap.channel),lightMapUv:bi&&_(x.lightMap.channel),bumpMapUv:Di&&_(x.bumpMap.channel),normalMapUv:Yt&&_(x.normalMap.channel),displacementMapUv:Wt&&_(x.displacementMap.channel),emissiveMapUv:fi&&_(x.emissiveMap.channel),metalnessMapUv:Xt&&_(x.metalnessMap.channel),roughnessMapUv:Ht&&_(x.roughnessMap.channel),anisotropyMapUv:Z&&_(x.anisotropyMap.channel),clearcoatMapUv:ue&&_(x.clearcoatMap.channel),clearcoatNormalMapUv:ge&&_(x.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:Q&&_(x.clearcoatRoughnessMap.channel),iridescenceMapUv:ie&&_(x.iridescenceMap.channel),iridescenceThicknessMapUv:pe&&_(x.iridescenceThicknessMap.channel),sheenColorMapUv:Fe&&_(x.sheenColorMap.channel),sheenRoughnessMapUv:_e&&_(x.sheenRoughnessMap.channel),specularMapUv:de&&_(x.specularMap.channel),specularColorMapUv:Ue&&_(x.specularColorMap.channel),specularIntensityMapUv:ze&&_(x.specularIntensityMap.channel),transmissionMapUv:ke&&_(x.transmissionMap.channel),thicknessMapUv:O&&_(x.thicknessMap.channel),alphaMapUv:ee&&_(x.alphaMap.channel),vertexTangents:!!F.attributes.tangent&&(Yt||B),vertexNormals:!!F.attributes.normal,vertexColors:x.vertexColors,vertexAlphas:x.vertexColors===!0&&!!F.attributes.color&&F.attributes.color.itemSize===4,pointsUvs:z.isPoints===!0&&!!F.attributes.uv&&(Et||ee),fog:!!N,useFog:x.fog===!0,fogExp2:!!N&&N.isFogExp2,flatShading:x.wireframe===!1&&(x.flatShading===!0||F.attributes.normal===void 0&&Yt===!1&&(x.isMeshLambertMaterial||x.isMeshPhongMaterial||x.isMeshStandardMaterial||x.isMeshPhysicalMaterial)),sizeAttenuation:x.sizeAttenuation===!0,logarithmicDepthBuffer:h,reversedDepthBuffer:pt,skinning:z.isSkinnedMesh===!0,hasPositionAttribute:F.attributes.position!==void 0,morphTargets:F.morphAttributes.position!==void 0,morphNormals:F.morphAttributes.normal!==void 0,morphColors:F.morphAttributes.color!==void 0,morphTargetsCount:Ge,morphTextureStride:Oe,numSunLights:A.sun.length,numDirLights:A.directional.length,numPointLights:A.point.length,numSpotLights:A.spot.length,numSpotLightMaps:A.spotLightMap.length,numRectAreaLights:A.rectArea.length,numHemiLights:A.hemi.length,numSunLightShadows:A.sunShadowMap.length,numDirLightShadows:A.directionalShadowMap.length,numPointLightShadows:A.pointShadowMap.length,numSpotLightShadows:A.spotShadowMap.length,numSpotLightShadowsWithMaps:A.numSpotLightShadowsWithMaps,numLightProbes:A.numLightProbes,numLightProbeGrids:Y.length,numClippingPlanes:o.numPlanes,numClipIntersection:o.numIntersection,dithering:x.dithering,shadowMapEnabled:n.shadowMap.enabled&&D.length>0,shadowMapType:n.shadowMap.type,toneMapping:Ce,decodeVideoTexture:Et&&x.map.isVideoTexture===!0&&Ye.getTransfer(x.map.colorSpace)===st,decodeVideoTextureEmissive:fi&&x.emissiveMap.isVideoTexture===!0&&Ye.getTransfer(x.emissiveMap.colorSpace)===st,premultipliedAlpha:x.premultipliedAlpha,doubleSided:x.side===wi,flipSided:x.side===Rt,useDepthPacking:x.depthPacking>=0,depthPacking:x.depthPacking||0,index0AttributeName:x.index0AttributeName,extensionClipCullDistance:se&&x.extensions.clipCullDistance===!0&&t.has("WEBGL_clip_cull_distance"),extensionMultiDraw:(se&&x.extensions.multiDraw===!0||Ie)&&t.has("WEBGL_multi_draw"),rendererExtensionParallelShaderCompile:t.has("KHR_parallel_shader_compile"),customProgramCacheKey:x.customProgramCacheKey()};return Le.vertexUv1s=c.has(1),Le.vertexUv2s=c.has(2),Le.vertexUv3s=c.has(3),c.clear(),Le}function m(x){let A=[];if(x.shaderID?A.push(x.shaderID):(A.push(x.customVertexShaderID),A.push(x.customFragmentShaderID)),x.defines!==void 0)for(let D in x.defines)A.push(D),A.push(x.defines[D]);return x.isRawShaderMaterial===!1&&(p(A,x),E(A,x),A.push(n.outputColorSpace)),A.push(x.customProgramCacheKey),A.join()}function p(x,A){x.push(A.precision),x.push(A.outputColorSpace),x.push(A.envMapMode),x.push(A.envMapCubeUVHeight),x.push(A.mapUv),x.push(A.alphaMapUv),x.push(A.lightMapUv),x.push(A.aoMapUv),x.push(A.bumpMapUv),x.push(A.normalMapUv),x.push(A.displacementMapUv),x.push(A.emissiveMapUv),x.push(A.metalnessMapUv),x.push(A.roughnessMapUv),x.push(A.anisotropyMapUv),x.push(A.clearcoatMapUv),x.push(A.clearcoatNormalMapUv),x.push(A.clearcoatRoughnessMapUv),x.push(A.iridescenceMapUv),x.push(A.iridescenceThicknessMapUv),x.push(A.sheenColorMapUv),x.push(A.sheenRoughnessMapUv),x.push(A.specularMapUv),x.push(A.specularColorMapUv),x.push(A.specularIntensityMapUv),x.push(A.transmissionMapUv),x.push(A.thicknessMapUv),x.push(A.combine),x.push(A.fogExp2),x.push(A.sizeAttenuation),x.push(A.morphTargetsCount),x.push(A.morphAttributeCount),x.push(A.numSunLights),x.push(A.numDirLights),x.push(A.numPointLights),x.push(A.numSpotLights),x.push(A.numSpotLightMaps),x.push(A.numHemiLights),x.push(A.numRectAreaLights),x.push(A.numSunLightShadows),x.push(A.numDirLightShadows),x.push(A.numPointLightShadows),x.push(A.numSpotLightShadows),x.push(A.numSpotLightShadowsWithMaps),x.push(A.numLightProbes),x.push(A.shadowMapType),x.push(A.toneMapping),x.push(A.numClippingPlanes),x.push(A.numClipIntersection),x.push(A.depthPacking)}function E(x,A){s.disableAll(),A.instancing&&s.enable(0),A.instancingColor&&s.enable(1),A.instancingMorph&&s.enable(2),A.matcap&&s.enable(3),A.envMap&&s.enable(4),A.normalMapObjectSpace&&s.enable(5),A.normalMapTangentSpace&&s.enable(6),A.clearcoat&&s.enable(7),A.iridescence&&s.enable(8),A.alphaTest&&s.enable(9),A.vertexColors&&s.enable(10),A.vertexAlphas&&s.enable(11),A.vertexUv1s&&s.enable(12),A.vertexUv2s&&s.enable(13),A.vertexUv3s&&s.enable(14),A.vertexTangents&&s.enable(15),A.anisotropy&&s.enable(16),A.alphaHash&&s.enable(17),A.batching&&s.enable(18),A.dispersion&&s.enable(19),A.retroreflection&&s.enable(24),A.batchingColor&&s.enable(20),A.gradientMap&&s.enable(21),A.packedNormalMap&&s.enable(22),A.vertexNormals&&s.enable(23),x.push(s.mask),s.disableAll(),A.fog&&s.enable(0),A.useFog&&s.enable(1),A.flatShading&&s.enable(2),A.logarithmicDepthBuffer&&s.enable(3),A.reversedDepthBuffer&&s.enable(4),A.skinning&&s.enable(5),A.morphTargets&&s.enable(6),A.morphNormals&&s.enable(7),A.morphColors&&s.enable(8),A.premultipliedAlpha&&s.enable(9),A.shadowMapEnabled&&s.enable(10),A.doubleSided&&s.enable(11),A.flipSided&&s.enable(12),A.useDepthPacking&&s.enable(13),A.dithering&&s.enable(14),A.transmission&&s.enable(15),A.sheen&&s.enable(16),A.opaque&&s.enable(17),A.pointsUvs&&s.enable(18),A.decodeVideoTexture&&s.enable(19),A.decodeVideoTextureEmissive&&s.enable(20),A.alphaToCoverage&&s.enable(21),A.numLightProbeGrids>0&&s.enable(22),A.hasPositionAttribute&&s.enable(23),x.push(s.mask)}function C(x){let A=d[x.type],D;if(A){let G=Qi[A];D=iu.clone(G.uniforms)}else D=x.uniforms;return D}function S(x,A){let D=f.get(A);return D!==void 0?++D.usedTimes:(D=new Tp(n,A,x,r),l.push(D),f.set(A,D)),D}function b(x){if(--x.usedTimes===0){let A=l.indexOf(x);l[A]=l[l.length-1],l.pop(),f.delete(x.cacheKey),x.destroy()}}function T(x){a.remove(x)}function P(){a.dispose()}return{getParameters:v,getProgramCacheKey:m,getUniforms:C,acquireProgram:S,releaseProgram:b,releaseShaderCache:T,programs:l,dispose:P}}function wp(){let n=new WeakMap;function e(s){return n.has(s)}function t(s){let a=n.get(s);return a===void 0&&(a={},n.set(s,a)),a}function i(s){n.delete(s)}function r(s,a,c){n.get(s)[a]=c}function o(){n=new WeakMap}return{has:e,get:t,remove:i,update:r,dispose:o}}function Ng(n,e){return n.groupOrder!==e.groupOrder?n.groupOrder-e.groupOrder:n.renderOrder!==e.renderOrder?n.renderOrder-e.renderOrder:n.material.id!==e.material.id?n.material.id-e.material.id:n.materialVariant!==e.materialVariant?n.materialVariant-e.materialVariant:n.z!==e.z?n.z-e.z:n.id-e.id}function Rp(n,e){return n.groupOrder!==e.groupOrder?n.groupOrder-e.groupOrder:n.renderOrder!==e.renderOrder?n.renderOrder-e.renderOrder:n.z!==e.z?e.z-n.z:n.id-e.id}function Cp(){let n=[],e=0,t=[],i=[],r=[];function o(){e=0,t.length=0,i.length=0,r.length=0}function s(u){let d=0;return u.isInstancedMesh&&(d+=2),u.isSkinnedMesh&&(d+=1),d}function a(u,d,_,v,m,p){let E=n[e];return E===void 0?(E={id:u.id,object:u,geometry:d,material:_,materialVariant:s(u),groupOrder:v,renderOrder:u.renderOrder,z:m,group:p},n[e]=E):(E.id=u.id,E.object=u,E.geometry=d,E.material=_,E.materialVariant=s(u),E.groupOrder=v,E.renderOrder=u.renderOrder,E.z=m,E.group=p),e++,E}function c(u,d,_,v,m,p,E){E.reversedDepth===!0&&(m=-m);let C=a(u,d,_,v,m,p);_.transmission>0?i.push(C):_.transparent===!0?r.push(C):t.push(C)}function l(u,d,_,v,m,p){let E=a(u,d,_,v,m,p);_.transmission>0?i.unshift(E):_.transparent===!0?r.unshift(E):t.unshift(E)}function f(u,d){t.length>1&&t.sort(u||Ng),i.length>1&&i.sort(d||Rp),r.length>1&&r.sort(d||Rp)}function h(){for(let u=e,d=n.length;u<d;u++){let _=n[u];if(_.id===null)break;_.id=null,_.object=null,_.geometry=null,_.material=null,_.group=null}}return{opaque:t,transmissive:i,transparent:r,init:o,push:c,unshift:l,finish:h,sort:f}}function Pp(){let n=new WeakMap;function e(i,r){let o=n.get(i),s;return o===void 0?(s=new Cp,n.set(i,[s])):r>=o.length?(s=new Cp,o.push(s)):s=o[r],s}function t(){n=new WeakMap}return{get:e,dispose:t}}function Og(){let n={};return{get:function(e){if(n[e.id]!==void 0)return n[e.id];let t;switch(e.type){case"SunLight":case"DirectionalLight":t={direction:new L,color:new Ee};break;case"SpotLight":t={position:new L,direction:new L,color:new Ee,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case"PointLight":t={position:new L,color:new Ee,distance:0,decay:0};break;case"HemisphereLight":t={direction:new L,skyColor:new Ee,groundColor:new Ee};break;case"RectAreaLight":t={color:new Ee,position:new L,halfWidth:new L,halfHeight:new L};break}return n[e.id]=t,t}}}function Bg(){let n={};return{get:function(e){if(n[e.id]!==void 0)return n[e.id];let t;switch(e.type){case"SunLight":case"DirectionalLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Ne};break;case"SpotLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Ne};break;case"PointLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Ne,shadowCameraNear:1,shadowCameraFar:1e3};break}return n[e.id]=t,t}}}var Gg=0;function zg(n,e){return(e.castShadow?2:0)-(n.castShadow?2:0)+(e.map?1:0)-(n.map?1:0)}function Lp(n){let e=new Og,t=Bg(),i={version:0,hash:{sunLength:-1,directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numSunShadows:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],sun:[],sunShadow:[],sunShadowMap:[],sunShadowMatrix:[],sunShadowCascade:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let l=0;l<9;l++)i.probe.push(new L);let r=new L,o=new Ze,s=new Ze;function a(l){let f=0,h=0,u=0;for(let z=0;z<9;z++)i.probe[z].set(0,0,0);let d=0,_=0,v=0,m=0,p=0,E=0,C=0,S=0,b=0,T=0,P=0,x=0,A=0,D=0;l.sort(zg);for(let z=0,Y=l.length;z<Y;z++){let N=l[z],F=N.color,te=N.intensity,$=N.distance,ae=null;if(N.shadow&&N.shadow.map&&(N.shadow.map.texture.format===zi?ae=N.shadow.map.texture:ae=N.shadow.map.depthTexture||N.shadow.map.texture),N.isAmbientLight)f+=F.r*te,h+=F.g*te,u+=F.b*te;else if(N.isLightProbe){for(let j=0;j<9;j++)i.probe[j].addScaledVector(N.sh.coefficients[j],te);D++}else if(N.isSunLight){let j=e.get(N);if(j.color.copy(N.color).multiplyScalar(N.intensity),N.castShadow){let re=N.shadow,oe=t.get(N);oe.shadowIntensity=re.intensity,oe.shadowBias=re.bias,oe.shadowNormalBias=re.normalBias,oe.shadowRadius=re.radius,oe.shadowMapSize.copy(re.mapSize).multiply(re.getFrameExtents()),i.sunShadow[_]=oe,i.sunShadowMap[_]=ae;let Ge=re.getViewportCount();for(let Oe=0;Oe<Ge;Oe++)i.sunShadowMatrix[v+Oe]=re.getMatrix(Oe),i.sunShadowCascade[v+Oe]=re._cascadeData[Oe];v+=Ge,_++}i.sun[d]=j,d++}else if(N.isDirectionalLight){let j=e.get(N);if(j.color.copy(N.color).multiplyScalar(N.intensity),N.castShadow){let re=N.shadow,oe=t.get(N);oe.shadowIntensity=re.intensity,oe.shadowBias=re.bias,oe.shadowNormalBias=re.normalBias,oe.shadowRadius=re.radius,oe.shadowMapSize=re.mapSize,i.directionalShadow[m]=oe,i.directionalShadowMap[m]=ae,i.directionalShadowMatrix[m]=N.shadow.matrix,b++}i.directional[m]=j,m++}else if(N.isSpotLight){let j=e.get(N);j.position.setFromMatrixPosition(N.matrixWorld),j.color.copy(F).multiplyScalar(te),j.distance=$,j.coneCos=Math.cos(N.angle),j.penumbraCos=Math.cos(N.angle*(1-N.penumbra)),j.decay=N.decay,i.spot[E]=j;let re=N.shadow;if(N.map&&(i.spotLightMap[x]=N.map,x++,re.updateMatrices(N),N.castShadow&&A++),i.spotLightMatrix[E]=re.matrix,N.castShadow){let oe=t.get(N);oe.shadowIntensity=re.intensity,oe.shadowBias=re.bias,oe.shadowNormalBias=re.normalBias,oe.shadowRadius=re.radius,oe.shadowMapSize=re.mapSize,i.spotShadow[E]=oe,i.spotShadowMap[E]=ae,P++}E++}else if(N.isRectAreaLight){let j=e.get(N);j.color.copy(F).multiplyScalar(te),j.halfWidth.set(N.width*.5,0,0),j.halfHeight.set(0,N.height*.5,0),i.rectArea[C]=j,C++}else if(N.isPointLight){let j=e.get(N);if(j.color.copy(N.color).multiplyScalar(N.intensity),j.distance=N.distance,j.decay=N.decay,N.castShadow){let re=N.shadow,oe=t.get(N);oe.shadowIntensity=re.intensity,oe.shadowBias=re.bias,oe.shadowNormalBias=re.normalBias,oe.shadowRadius=re.radius,oe.shadowMapSize=re.mapSize,oe.shadowCameraNear=re.camera.near,oe.shadowCameraFar=re.camera.far,i.pointShadow[p]=oe,i.pointShadowMap[p]=ae,i.pointShadowMatrix[p]=N.shadow.matrix,T++}i.point[p]=j,p++}else if(N.isHemisphereLight){let j=e.get(N);j.skyColor.copy(N.color).multiplyScalar(te),j.groundColor.copy(N.groundColor).multiplyScalar(te),i.hemi[S]=j,S++}}C>0&&(n.has("OES_texture_float_linear")===!0?(i.rectAreaLTC1=ve.LTC_FLOAT_1,i.rectAreaLTC2=ve.LTC_FLOAT_2):(i.rectAreaLTC1=ve.LTC_HALF_1,i.rectAreaLTC2=ve.LTC_HALF_2)),i.ambient[0]=f,i.ambient[1]=h,i.ambient[2]=u;let G=i.hash;(G.sunLength!==d||G.directionalLength!==m||G.pointLength!==p||G.spotLength!==E||G.rectAreaLength!==C||G.hemiLength!==S||G.numSunShadows!==_||G.numDirectionalShadows!==b||G.numPointShadows!==T||G.numSpotShadows!==P||G.numSpotMaps!==x||G.numLightProbes!==D)&&(i.sun.length=d,i.directional.length=m,i.spot.length=E,i.rectArea.length=C,i.point.length=p,i.hemi.length=S,i.sunShadow.length=_,i.sunShadowMap.length=_,i.sunShadowMatrix.length=v,i.sunShadowCascade.length=v,i.directionalShadow.length=b,i.directionalShadowMap.length=b,i.directionalShadowMatrix.length=b,i.pointShadow.length=T,i.pointShadowMap.length=T,i.pointShadowMatrix.length=T,i.spotShadow.length=P,i.spotShadowMap.length=P,i.spotLightMatrix.length=P+x-A,i.spotLightMap.length=x,i.numSpotLightShadowsWithMaps=A,i.numLightProbes=D,G.sunLength=d,G.directionalLength=m,G.pointLength=p,G.spotLength=E,G.rectAreaLength=C,G.hemiLength=S,G.numSunShadows=_,G.numDirectionalShadows=b,G.numPointShadows=T,G.numSpotShadows=P,G.numSpotMaps=x,G.numLightProbes=D,i.version=Gg++)}function c(l,f){let h=0,u=0,d=0,_=0,v=0,m=0,p=f.matrixWorldInverse;for(let E=0,C=l.length;E<C;E++){let S=l[E];if(S.isSunLight){let b=i.sun[h];b.direction.setFromMatrixPosition(S.matrixWorld),b.direction.transformDirection(p),h++}else if(S.isDirectionalLight){let b=i.directional[u];b.direction.setFromMatrixPosition(S.matrixWorld),r.setFromMatrixPosition(S.target.matrixWorld),b.direction.sub(r),b.direction.transformDirection(p),u++}else if(S.isSpotLight){let b=i.spot[_];b.position.setFromMatrixPosition(S.matrixWorld),b.position.applyMatrix4(p),b.direction.setFromMatrixPosition(S.matrixWorld),r.setFromMatrixPosition(S.target.matrixWorld),b.direction.sub(r),b.direction.transformDirection(p),_++}else if(S.isRectAreaLight){let b=i.rectArea[v];b.position.setFromMatrixPosition(S.matrixWorld),b.position.applyMatrix4(p),s.identity(),o.copy(S.matrixWorld),o.premultiply(p),s.extractRotation(o),b.halfWidth.set(S.width*.5,0,0),b.halfHeight.set(0,S.height*.5,0),b.halfWidth.applyMatrix4(s),b.halfHeight.applyMatrix4(s),v++}else if(S.isPointLight){let b=i.point[d];b.position.setFromMatrixPosition(S.matrixWorld),b.position.applyMatrix4(p),d++}else if(S.isHemisphereLight){let b=i.hemi[m];b.direction.setFromMatrixPosition(S.matrixWorld),b.direction.transformDirection(p),m++}}}return{setup:a,setupView:c,state:i}}function Dp(n){let e=new Lp(n),t=[],i=[],r=[];function o(u){h.camera=u,t.length=0,i.length=0,r.length=0}function s(u){t.push(u)}function a(u){i.push(u)}function c(u){r.push(u)}function l(){e.setup(t)}function f(u){e.setupView(t,u)}let h={lightsArray:t,shadowsArray:i,lightProbeGridArray:r,camera:null,lights:e,transmissionRenderTarget:{},textureUnits:0};return{init:o,state:h,setupLights:l,setupLightsView:f,pushLight:s,pushShadow:a,pushLightProbeGrid:c}}function Ip(n){let e=new WeakMap;function t(r,o=0){let s=e.get(r),a;return s===void 0?(a=new Dp(n),e.set(r,[a])):o>=s.length?(a=new Dp(n),s.push(a)):a=s[o],a}function i(){e=new WeakMap}return{get:t,dispose:i}}var Fp=`void main() {
gl_Position = vec4( position, 1.0 );
}
`,Up=`uniform sampler2D shadow_pass;
uniform vec2 resolution;
uniform float radius;
void main() {
const float samples = float( VSM_SAMPLES );
float mean = 0.0;
float squared_mean = 0.0;
float uvStride = samples <= 1.0 ? 0.0 : 2.0 / ( samples - 1.0 );
float uvStart = samples <= 1.0 ? 0.0 : - 1.0;
for ( float i = 0.0; i < samples; i ++ ) {
float uvOffset = uvStart + i * uvStride;
#ifdef HORIZONTAL_PASS
vec2 distribution = texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( uvOffset, 0.0 ) * radius ) / resolution ).rg;
mean += distribution.x;
squared_mean += distribution.y * distribution.y + distribution.x * distribution.x;
#else
float depth = texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( 0.0, uvOffset ) * radius ) / resolution ).r;
mean += depth;
squared_mean += depth * depth;
#endif
}
mean = mean / samples;
squared_mean = squared_mean / samples;
float std_dev = sqrt( max( 0.0, squared_mean - mean * mean ) );
gl_FragColor = vec4( mean, std_dev, 0.0, 1.0 );
}
`;var Hg=[new L(1,0,0),new L(-1,0,0),new L(0,1,0),new L(0,-1,0),new L(0,0,1),new L(0,0,-1)],kg=[new L(0,-1,0),new L(0,-1,0),new L(0,0,1),new L(0,0,-1),new L(0,-1,0),new L(0,-1,0)],Np=new Ze,Ks=new L,Ec=new L;function Op(n,e,t){let i=new rr,r=new Ne,o=new Ne,s=new At,a=new Dr,c=new sl,l={},f=t.maxTextureSize,h={[Xi]:Rt,[Rt]:Xi,[wi]:wi},u=new yi({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new Ne},radius:{value:4}},vertexShader:Fp,fragmentShader:Up}),d=u.clone();d.defines.HORIZONTAL_PASS=1;let _=new Ct;_.setAttribute("position",new Vt(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));let v=new We(_,u),m=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=Yn;let p=this.type;this.render=function(T,P,x){if(m.enabled===!1||m.autoUpdate===!1&&m.needsUpdate===!1||T.length===0)return;this.type===Xc&&(Re("WebGLShadowMap: PCFSoftShadowMap has been removed. Using PCFShadowMap instead."),this.type=Yn);let A=n.getRenderTarget(),D=n.getActiveCubeFace(),G=n.getActiveMipmapLevel(),z=n.state;z.setBlending(Bi),z.buffers.depth.getReversed()===!0?z.buffers.color.setClear(0,0,0,0):z.buffers.color.setClear(1,1,1,1),z.buffers.depth.setTest(!0),z.setScissorTest(!1);let Y=p!==this.type;Y&&P.traverse(function(N){N.material&&(Array.isArray(N.material)?N.material.forEach(F=>F.needsUpdate=!0):N.material.needsUpdate=!0)});for(let N=0,F=T.length;N<F;N++){let te=T[N],$=te.shadow;if($===void 0){Re("WebGLShadowMap:",te,"has no shadow.");continue}if($.autoUpdate===!1&&$.needsUpdate===!1)continue;r.copy($.mapSize);let ae=$.getFrameExtents();r.multiply(ae),o.copy($.mapSize),(r.x>f||r.y>f)&&(r.x>f&&(o.x=Math.floor(f/ae.x),r.x=o.x*ae.x,$.mapSize.x=o.x),r.y>f&&(o.y=Math.floor(f/ae.y),r.y=o.y*ae.y,$.mapSize.y=o.y));let j=n.state.buffers.depth.getReversed();if($.camera._reversedDepth=j,$.map===null||Y===!0){if($.map!==null&&($.map.depthTexture!==null&&($.map.depthTexture.dispose(),$.map.depthTexture=null),$.map.dispose()),this.type===_r){if(te.isPointLight){Re("WebGLShadowMap: VSM shadow maps are not supported for PointLights. Use PCF or BasicShadowMap instead.");continue}$.map=new _i(r.x,r.y,{format:zi,type:jt,minFilter:Bt,magFilter:Bt,generateMipmaps:!1}),$.map.texture.name=te.name+".shadowMap",$.map.depthTexture=new On(r.x,r.y,Kt),$.map.depthTexture.name=te.name+".shadowMapDepth",$.map.depthTexture.format=Gi,$.map.depthTexture.compareFunction=null,$.map.depthTexture.minFilter=Ut,$.map.depthTexture.magFilter=Ut}else te.isPointLight?($.map=new Fo(r.x),$.map.depthTexture=new ja(r.x,pi)):($.map=new _i(r.x,r.y),$.map.depthTexture=new On(r.x,r.y,pi)),$.map.depthTexture.name=te.name+".shadowMap",$.map.depthTexture.format=Gi,this.type===Yn?($.map.depthTexture.compareFunction=j?no:io,$.map.depthTexture.minFilter=Bt,$.map.depthTexture.magFilter=Bt):($.map.depthTexture.compareFunction=null,$.map.depthTexture.minFilter=Ut,$.map.depthTexture.magFilter=Ut);$.camera.updateProjectionMatrix()}$.map.isWebGLCubeRenderTarget!==!0&&($.map.width!==r.x||$.map.height!==r.y)&&$.map.setSize(r.x,r.y);let re=$.map.isWebGLCubeRenderTarget?6:$.getViewportCount();te.isPointLight!==!0&&$.updateMatrices(te,x);for(let oe=0;oe<re;oe++){let Ge=$.getCamera(oe);if(te.isPointLight){let Oe=$.camera,Dt=$.matrix,at=te.distance||Oe.far;at!==Oe.far&&(Oe.far=at,Oe.updateProjectionMatrix()),Ks.setFromMatrixPosition(te.matrixWorld),Oe.position.copy(Ks),Ec.copy(Oe.position),Ec.add(Hg[oe]),Oe.up.copy(kg[oe]),Oe.lookAt(Ec),Oe.updateMatrixWorld(),Dt.makeTranslation(-Ks.x,-Ks.y,-Ks.z),Np.multiplyMatrices(Oe.projectionMatrix,Oe.matrixWorldInverse),$._frustum.setFromProjectionMatrix(Np,Oe.coordinateSystem,Oe.reversedDepth)}if($.map.isWebGLCubeRenderTarget)n.setRenderTarget($.map,oe),n.clear();else{oe===0&&(n.setRenderTarget($.map),n.clear());let Oe=$.getViewport(oe);s.set(o.x*Oe.x,o.y*Oe.y,o.x*Oe.z,o.y*Oe.w),z.viewport(s)}i=$.getFrustum(oe),S(P,x,Ge,te,this.type)}$.isPointLightShadow!==!0&&this.type===_r&&E($,x),$.needsUpdate=!1}p=this.type,m.needsUpdate=!1,n.setRenderTarget(A,D,G)};function E(T,P){let x=e.update(v);u.defines.VSM_SAMPLES!==T.blurSamples&&(u.defines.VSM_SAMPLES=T.blurSamples,d.defines.VSM_SAMPLES=T.blurSamples,u.needsUpdate=!0,d.needsUpdate=!0),T.mapPass===null?T.mapPass=new _i(r.x,r.y,{format:zi,type:jt}):(T.mapPass.width!==T.map.width||T.mapPass.height!==T.map.height)&&T.mapPass.setSize(T.map.width,T.map.height),u.uniforms.shadow_pass.value=T.map.depthTexture,u.uniforms.resolution.value.set(T.map.width,T.map.height),u.uniforms.radius.value=T.radius,n.setRenderTarget(T.mapPass),n.clear(),n.renderBufferDirect(P,null,x,u,v,null),d.uniforms.shadow_pass.value=T.mapPass.texture,d.uniforms.resolution.value.set(T.map.width,T.map.height),d.uniforms.radius.value=T.radius,n.setRenderTarget(T.map),n.clear(),n.renderBufferDirect(P,null,x,d,v,null)}function C(T,P,x,A){let D=null,G=x.isPointLight===!0?T.customDistanceMaterial:T.customDepthMaterial;if(G!==void 0)D=G;else if(D=x.isPointLight===!0?c:a,n.localClippingEnabled&&P.clipShadows===!0&&Array.isArray(P.clippingPlanes)&&P.clippingPlanes.length!==0||P.displacementMap&&P.displacementScale!==0||P.alphaMap&&P.alphaTest>0||P.map&&P.alphaTest>0||P.alphaToCoverage===!0){let z=D.uuid,Y=P.uuid,N=l[z];N===void 0&&(N={},l[z]=N);let F=N[Y];F===void 0&&(F=D.clone(),N[Y]=F,P.addEventListener("dispose",b)),D=F}if(D.visible=P.visible,D.wireframe=P.wireframe,A===_r?D.side=P.shadowSide!==null?P.shadowSide:P.side:D.side=P.shadowSide!==null?P.shadowSide:h[P.side],D.alphaMap=P.alphaMap,D.alphaTest=P.alphaToCoverage===!0?.5:P.alphaTest,D.map=P.map,D.clipShadows=P.clipShadows,D.clippingPlanes=P.clippingPlanes,D.clipIntersection=P.clipIntersection,D.displacementMap=P.displacementMap,D.displacementScale=P.displacementScale,D.displacementBias=P.displacementBias,D.wireframeLinewidth=P.wireframeLinewidth,D.linewidth=P.linewidth,x.isPointLight===!0&&D.isMeshDistanceMaterial===!0){let z=n.properties.get(D);z.light=x}return D}function S(T,P,x,A,D){if(T.visible===!1)return;if(T.layers.test(P.layers)&&(T.isMesh||T.isLine||T.isPoints)&&(T.castShadow||T.receiveShadow&&D===_r)&&(!T.frustumCulled||T.intersectsFrustum(i))){T.modelViewMatrix.multiplyMatrices(x.matrixWorldInverse,T.matrixWorld);let Y=e.update(T),N=T.material;if(Array.isArray(N)){let F=Y.groups;for(let te=0,$=F.length;te<$;te++){let ae=F[te],j=N[ae.materialIndex];if(j&&j.visible){let re=C(T,j,A,D);T.onBeforeShadow(n,T,P,x,Y,re,ae),n.renderBufferDirect(x,null,Y,re,T,ae),T.onAfterShadow(n,T,P,x,Y,re,ae)}}}else if(N.visible){let F=C(T,N,A,D);T.onBeforeShadow(n,T,P,x,Y,F,null),n.renderBufferDirect(x,null,Y,F,T,null),T.onAfterShadow(n,T,P,x,Y,F,null)}}let z=T.children;for(let Y=0,N=z.length;Y<N;Y++)S(z[Y],P,x,A,D)}function b(T){T.target.removeEventListener("dispose",b);for(let x in l){let A=l[x],D=T.target.uuid;D in A&&(A[D].dispose(),delete A[D])}}}function Bp(n,e){function t(){let O=!1,me=new At,ee=null,he=new At(0,0,0,0);return{setMask:function(Se){ee!==Se&&!O&&(n.colorMask(Se,Se,Se,Se),ee=Se)},setLocked:function(Se){O=Se},setClear:function(Se,se,Ce,Le,ot){ot===!0&&(Se*=Le,se*=Le,Ce*=Le),me.set(Se,se,Ce,Le),he.equals(me)===!1&&(n.clearColor(Se,se,Ce,Le),he.copy(me))},reset:function(){O=!1,ee=null,he.set(-1,0,0,0)}}}function i(){let O=!1,me=!1,ee=null,he=null,Se=null;return{setReversed:function(se){if(me!==se){let Ce=e.get("EXT_clip_control");se?Ce.clipControlEXT(Ce.LOWER_LEFT_EXT,Ce.ZERO_TO_ONE_EXT):Ce.clipControlEXT(Ce.LOWER_LEFT_EXT,Ce.NEGATIVE_ONE_TO_ONE_EXT),me=se;let Le=Se;Se=null,this.setClear(Le)}},getReversed:function(){return me},setTest:function(se){se?ye(n.DEPTH_TEST):pt(n.DEPTH_TEST)},setMask:function(se){ee!==se&&!O&&(n.depthMask(se),ee=se)},setFunc:function(se){if(me&&(se=Cf[se]),he!==se){switch(se){case qo:n.depthFunc(n.NEVER);break;case Yo:n.depthFunc(n.ALWAYS);break;case Zo:n.depthFunc(n.LESS);break;case Jn:n.depthFunc(n.LEQUAL);break;case Ko:n.depthFunc(n.EQUAL);break;case Jo:n.depthFunc(n.GEQUAL);break;case $o:n.depthFunc(n.GREATER);break;case Qo:n.depthFunc(n.NOTEQUAL);break;default:n.depthFunc(n.LEQUAL)}he=se}},setLocked:function(se){O=se},setClear:function(se){Se!==se&&(Se=se,me&&(se=1-se),n.clearDepth(se))},reset:function(){O=!1,ee=null,he=null,Se=null,me=!1}}}function r(){let O=!1,me=null,ee=null,he=null,Se=null,se=null,Ce=null,Le=null,ot=null;return{setTest:function(tt){O||(tt?ye(n.STENCIL_TEST):pt(n.STENCIL_TEST))},setMask:function(tt){me!==tt&&!O&&(n.stencilMask(tt),me=tt)},setFunc:function(tt,Ii,Ti){(ee!==tt||he!==Ii||Se!==Ti)&&(n.stencilFunc(tt,Ii,Ti),ee=tt,he=Ii,Se=Ti)},setOp:function(tt,Ii,Ti){(se!==tt||Ce!==Ii||Le!==Ti)&&(n.stencilOp(tt,Ii,Ti),se=tt,Ce=Ii,Le=Ti)},setLocked:function(tt){O=tt},setClear:function(tt){ot!==tt&&(n.clearStencil(tt),ot=tt)},reset:function(){O=!1,me=null,ee=null,he=null,Se=null,se=null,Ce=null,Le=null,ot=null}}}let o=new t,s=new i,a=new r,c=new WeakMap,l=new WeakMap,f={},h={},u={},d=new WeakMap,_=[],v=null,m=!1,p=null,E=null,C=null,S=null,b=null,T=null,P=null,x=new Ee(0,0,0),A=0,D=!1,G=null,z=null,Y=null,N=null,F=null,te=n.getParameter(n.MAX_COMBINED_TEXTURE_IMAGE_UNITS),$=!1,ae=0,j=n.getParameter(n.VERSION);j.indexOf("WebGL")!==-1?(ae=parseFloat(/^WebGL (\d)/.exec(j)[1]),$=ae>=1):j.indexOf("OpenGL ES")!==-1&&(ae=parseFloat(/^OpenGL ES (\d)/.exec(j)[1]),$=ae>=2);let re=null,oe={},Ge=n.getParameter(n.SCISSOR_BOX),Oe=n.getParameter(n.VIEWPORT),Dt=new At().fromArray(Ge),at=new At().fromArray(Oe);function ct(O,me,ee,he){let Se=new Uint8Array(4),se=n.createTexture();n.bindTexture(O,se),n.texParameteri(O,n.TEXTURE_MIN_FILTER,n.NEAREST),n.texParameteri(O,n.TEXTURE_MAG_FILTER,n.NEAREST);for(let Ce=0;Ce<ee;Ce++)O===n.TEXTURE_3D||O===n.TEXTURE_2D_ARRAY?n.texImage3D(me,0,n.RGBA,1,1,he,0,n.RGBA,n.UNSIGNED_BYTE,Se):n.texImage2D(me+Ce,0,n.RGBA,1,1,0,n.RGBA,n.UNSIGNED_BYTE,Se);return se}let xt={};xt[n.TEXTURE_2D]=ct(n.TEXTURE_2D,n.TEXTURE_2D,1),xt[n.TEXTURE_CUBE_MAP]=ct(n.TEXTURE_CUBE_MAP,n.TEXTURE_CUBE_MAP_POSITIVE_X,6),xt[n.TEXTURE_2D_ARRAY]=ct(n.TEXTURE_2D_ARRAY,n.TEXTURE_2D_ARRAY,1,1),xt[n.TEXTURE_3D]=ct(n.TEXTURE_3D,n.TEXTURE_3D,1,1),o.setClear(0,0,0,1),s.setClear(1),a.setClear(0),ye(n.DEPTH_TEST),s.setFunc(Jn),Di(!1),Yt(Cl),ye(n.CULL_FACE),zt(Bi);function ye(O){f[O]!==!0&&(n.enable(O),f[O]=!0)}function pt(O){f[O]!==!1&&(n.disable(O),f[O]=!1)}function Gt(O,me){return u[O]!==me?(n.bindFramebuffer(O,me),u[O]=me,O===n.DRAW_FRAMEBUFFER&&(u[n.FRAMEBUFFER]=me),O===n.FRAMEBUFFER&&(u[n.DRAW_FRAMEBUFFER]=me),!0):!1}function Ie(O,me){let ee=_,he=!1;if(O){ee=d.get(me),ee===void 0&&(ee=[],d.set(me,ee));let Se=O.textures;if(ee.length!==Se.length||ee[0]!==n.COLOR_ATTACHMENT0){for(let se=0,Ce=Se.length;se<Ce;se++)ee[se]=n.COLOR_ATTACHMENT0+se;ee.length=Se.length,he=!0}}else ee[0]!==n.BACK&&(ee[0]=n.BACK,he=!0);he&&n.drawBuffers(ee)}function Et(O){return v!==O?(n.useProgram(O),v=O,!0):!1}let ci={[Kn]:n.FUNC_ADD,[Yc]:n.FUNC_SUBTRACT,[Zc]:n.FUNC_REVERSE_SUBTRACT};ci[Kc]=n.MIN,ci[Jc]=n.MAX;let si={[$c]:n.ZERO,[Qc]:n.ONE,[jc]:n.SRC_COLOR,[sa]:n.SRC_ALPHA,[sf]:n.SRC_ALPHA_SATURATE,[rf]:n.DST_COLOR,[tf]:n.DST_ALPHA,[ef]:n.ONE_MINUS_SRC_COLOR,[aa]:n.ONE_MINUS_SRC_ALPHA,[of]:n.ONE_MINUS_DST_COLOR,[nf]:n.ONE_MINUS_DST_ALPHA,[af]:n.CONSTANT_COLOR,[lf]:n.ONE_MINUS_CONSTANT_COLOR,[cf]:n.CONSTANT_ALPHA,[ff]:n.ONE_MINUS_CONSTANT_ALPHA};function zt(O,me,ee,he,Se,se,Ce,Le,ot,tt){if(O===Bi){m===!0&&(pt(n.BLEND),m=!1);return}if(m===!1&&(ye(n.BLEND),m=!0),O!==qc){if(O!==p||tt!==D){if((E!==Kn||b!==Kn)&&(n.blendEquation(n.FUNC_ADD),E=Kn,b=Kn),tt)switch(O){case Zn:n.blendFuncSeparate(n.ONE,n.ONE_MINUS_SRC_ALPHA,n.ONE,n.ONE_MINUS_SRC_ALPHA);break;case Xo:n.blendFunc(n.ONE,n.ONE);break;case Pl:n.blendFuncSeparate(n.ZERO,n.ONE_MINUS_SRC_COLOR,n.ZERO,n.ONE);break;case Ll:n.blendFuncSeparate(n.DST_COLOR,n.ONE_MINUS_SRC_ALPHA,n.ZERO,n.ONE);break;default:Qe("WebGLState: Invalid blending: ",O);break}else switch(O){case Zn:n.blendFuncSeparate(n.SRC_ALPHA,n.ONE_MINUS_SRC_ALPHA,n.ONE,n.ONE_MINUS_SRC_ALPHA);break;case Xo:n.blendFuncSeparate(n.SRC_ALPHA,n.ONE,n.ONE,n.ONE);break;case Pl:Qe("WebGLState: SubtractiveBlending requires material.premultipliedAlpha = true");break;case Ll:Qe("WebGLState: MultiplyBlending requires material.premultipliedAlpha = true");break;default:Qe("WebGLState: Invalid blending: ",O);break}C=null,S=null,T=null,P=null,x.set(0,0,0),A=0,p=O,D=tt}return}Se=Se||me,se=se||ee,Ce=Ce||he,(me!==E||Se!==b)&&(n.blendEquationSeparate(ci[me],ci[Se]),E=me,b=Se),(ee!==C||he!==S||se!==T||Ce!==P)&&(n.blendFuncSeparate(si[ee],si[he],si[se],si[Ce]),C=ee,S=he,T=se,P=Ce),(Le.equals(x)===!1||ot!==A)&&(n.blendColor(Le.r,Le.g,Le.b,ot),x.copy(Le),A=ot),p=O,D=!1}function bi(O,me){O.side===wi?pt(n.CULL_FACE):ye(n.CULL_FACE);let ee=O.side===Rt;me&&(ee=!ee),Di(ee),O.blending===Zn&&O.transparent===!1?zt(Bi):zt(O.blending,O.blendEquation,O.blendSrc,O.blendDst,O.blendEquationAlpha,O.blendSrcAlpha,O.blendDstAlpha,O.blendColor,O.blendAlpha,O.premultipliedAlpha),s.setFunc(O.depthFunc),s.setTest(O.depthTest),s.setMask(O.depthWrite),o.setMask(O.colorWrite);let he=O.stencilWrite;a.setTest(he),he&&(a.setMask(O.stencilWriteMask),a.setFunc(O.stencilFunc,O.stencilRef,O.stencilFuncMask),a.setOp(O.stencilFail,O.stencilZFail,O.stencilZPass)),fi(O.polygonOffset,O.polygonOffsetFactor,O.polygonOffsetUnits),O.alphaToCoverage===!0?ye(n.SAMPLE_ALPHA_TO_COVERAGE):pt(n.SAMPLE_ALPHA_TO_COVERAGE)}function Di(O){G!==O&&(O?n.frontFace(n.CW):n.frontFace(n.CCW),G=O)}function Yt(O){O!==kc?(ye(n.CULL_FACE),O!==z&&(O===Cl?n.cullFace(n.BACK):O===Wc?n.cullFace(n.FRONT):n.cullFace(n.FRONT_AND_BACK))):pt(n.CULL_FACE),z=O}function Wt(O){O!==Y&&($&&n.lineWidth(O),Y=O)}function fi(O,me,ee){O?(ye(n.POLYGON_OFFSET_FILL),(N!==me||F!==ee)&&(N=me,F=ee,s.getReversed()&&(me=-me),n.polygonOffset(me,ee))):pt(n.POLYGON_OFFSET_FILL)}function Xt(O){O?ye(n.SCISSOR_TEST):pt(n.SCISSOR_TEST)}function Ht(O){O===void 0&&(O=n.TEXTURE0+te-1),re!==O&&(n.activeTexture(O),re=O)}function B(O,me,ee){ee===void 0&&(re===null?ee=n.TEXTURE0+te-1:ee=re);let he=oe[ee];he===void 0&&(he={type:void 0,texture:void 0},oe[ee]=he),(he.type!==O||he.texture!==me)&&(re!==ee&&(n.activeTexture(ee),re=ee),n.bindTexture(O,me||xt[O]),he.type=O,he.texture=me)}function ui(){let O=oe[re];O!==void 0&&O.type!==void 0&&(n.bindTexture(O.type,null),O.type=void 0,O.texture=void 0)}function vt(){try{n.compressedTexImage2D(...arguments)}catch(O){Qe("WebGLState:",O)}}function w(){try{n.compressedTexImage3D(...arguments)}catch(O){Qe("WebGLState:",O)}}function g(){try{n.texSubImage2D(...arguments)}catch(O){Qe("WebGLState:",O)}}function H(){try{n.texSubImage3D(...arguments)}catch(O){Qe("WebGLState:",O)}}function q(){try{n.compressedTexSubImage2D(...arguments)}catch(O){Qe("WebGLState:",O)}}function Z(){try{n.compressedTexSubImage3D(...arguments)}catch(O){Qe("WebGLState:",O)}}function ue(){try{n.texStorage2D(...arguments)}catch(O){Qe("WebGLState:",O)}}function ge(){try{n.texStorage3D(...arguments)}catch(O){Qe("WebGLState:",O)}}function Q(){try{n.texImage2D(...arguments)}catch(O){Qe("WebGLState:",O)}}function ie(){try{n.texImage3D(...arguments)}catch(O){Qe("WebGLState:",O)}}function pe(O){return h[O]!==void 0?h[O]:n.getParameter(O)}function Fe(O,me){h[O]!==me&&(n.pixelStorei(O,me),h[O]=me)}function _e(O){Dt.equals(O)===!1&&(n.scissor(O.x,O.y,O.z,O.w),Dt.copy(O))}function de(O){at.equals(O)===!1&&(n.viewport(O.x,O.y,O.z,O.w),at.copy(O))}function Ue(O,me){let ee=l.get(me);ee===void 0&&(ee=new WeakMap,l.set(me,ee));let he=ee.get(O);he===void 0&&(he=n.getUniformBlockIndex(me,O.name),ee.set(O,he))}function ze(O,me){let he=l.get(me).get(O);c.get(me)!==he&&(n.uniformBlockBinding(me,he,O.__bindingPointIndex),c.set(me,he))}function ke(){n.disable(n.BLEND),n.disable(n.CULL_FACE),n.disable(n.DEPTH_TEST),n.disable(n.POLYGON_OFFSET_FILL),n.disable(n.SCISSOR_TEST),n.disable(n.STENCIL_TEST),n.disable(n.SAMPLE_ALPHA_TO_COVERAGE),n.blendEquation(n.FUNC_ADD),n.blendFunc(n.ONE,n.ZERO),n.blendFuncSeparate(n.ONE,n.ZERO,n.ONE,n.ZERO),n.blendColor(0,0,0,0),n.colorMask(!0,!0,!0,!0),n.clearColor(0,0,0,0),n.depthMask(!0),n.depthFunc(n.LESS),s.setReversed(!1),n.clearDepth(1),n.stencilMask(4294967295),n.stencilFunc(n.ALWAYS,0,4294967295),n.stencilOp(n.KEEP,n.KEEP,n.KEEP),n.clearStencil(0),n.cullFace(n.BACK),n.frontFace(n.CCW),n.polygonOffset(0,0),n.activeTexture(n.TEXTURE0),n.bindFramebuffer(n.FRAMEBUFFER,null),n.bindFramebuffer(n.DRAW_FRAMEBUFFER,null),n.bindFramebuffer(n.READ_FRAMEBUFFER,null),n.useProgram(null),n.lineWidth(1),n.scissor(0,0,n.canvas.width,n.canvas.height),n.viewport(0,0,n.canvas.width,n.canvas.height),n.pixelStorei(n.PACK_ALIGNMENT,4),n.pixelStorei(n.UNPACK_ALIGNMENT,4),n.pixelStorei(n.UNPACK_FLIP_Y_WEBGL,!1),n.pixelStorei(n.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),n.pixelStorei(n.UNPACK_COLORSPACE_CONVERSION_WEBGL,n.BROWSER_DEFAULT_WEBGL),n.pixelStorei(n.PACK_ROW_LENGTH,0),n.pixelStorei(n.PACK_SKIP_PIXELS,0),n.pixelStorei(n.PACK_SKIP_ROWS,0),n.pixelStorei(n.UNPACK_ROW_LENGTH,0),n.pixelStorei(n.UNPACK_IMAGE_HEIGHT,0),n.pixelStorei(n.UNPACK_SKIP_PIXELS,0),n.pixelStorei(n.UNPACK_SKIP_ROWS,0),n.pixelStorei(n.UNPACK_SKIP_IMAGES,0),f={},h={},re=null,oe={},u={},d=new WeakMap,_=[],v=null,m=!1,p=null,E=null,C=null,S=null,b=null,T=null,P=null,x=new Ee(0,0,0),A=0,D=!1,G=null,z=null,Y=null,N=null,F=null,Dt.set(0,0,n.canvas.width,n.canvas.height),at.set(0,0,n.canvas.width,n.canvas.height),o.reset(),s.reset(),a.reset()}return{buffers:{color:o,depth:s,stencil:a},enable:ye,disable:pt,bindFramebuffer:Gt,drawBuffers:Ie,useProgram:Et,setBlending:zt,setMaterial:bi,setFlipSided:Di,setCullFace:Yt,setLineWidth:Wt,setPolygonOffset:fi,setScissorTest:Xt,activeTexture:Ht,bindTexture:B,unbindTexture:ui,compressedTexImage2D:vt,compressedTexImage3D:w,texImage2D:Q,texImage3D:ie,pixelStorei:Fe,getParameter:pe,updateUBOMapping:Ue,uniformBlockBinding:ze,texStorage2D:ue,texStorage3D:ge,texSubImage2D:g,texSubImage3D:H,compressedTexSubImage2D:q,compressedTexSubImage3D:Z,scissor:_e,viewport:de,reset:ke}}function Gp(n,e,t,i,r,o,s){let a=e.has("WEBGL_multisampled_render_to_texture")?e.get("WEBGL_multisampled_render_to_texture"):null,c=typeof navigator>"u"?!1:/OculusBrowser/g.test(navigator.userAgent),l=new Ne,f=new WeakMap,h=new Set,u,d=new WeakMap,_=!1;try{_=typeof OffscreenCanvas<"u"&&new OffscreenCanvas(1,1).getContext("2d")!==null}catch{}function v(w,g){return _?new OffscreenCanvas(w,g):oo("canvas")}function m(w,g,H){let q=1,Z=vt(w);if((Z.width>H||Z.height>H)&&(q=H/Math.max(Z.width,Z.height)),q<1)if(typeof HTMLImageElement<"u"&&w instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&w instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&w instanceof ImageBitmap||typeof VideoFrame<"u"&&w instanceof VideoFrame){let ue=Math.floor(q*Z.width),ge=Math.floor(q*Z.height);u===void 0&&(u=v(ue,ge));let Q=g?v(ue,ge):u;return Q.width=ue,Q.height=ge,Q.getContext("2d").drawImage(w,0,0,ue,ge),Re("WebGLRenderer: Texture has been resized from ("+Z.width+"x"+Z.height+") to ("+ue+"x"+ge+")."),Q}else return"data"in w&&Re("WebGLRenderer: Image in DataTexture is too big ("+Z.width+"x"+Z.height+")."),w;return w}function p(w){return w.generateMipmaps}function E(w){n.generateMipmap(w)}function C(w){return w.isWebGLCubeRenderTarget?n.TEXTURE_CUBE_MAP:w.isWebGL3DRenderTarget?n.TEXTURE_3D:w.isWebGLArrayRenderTarget||w.isCompressedArrayTexture?n.TEXTURE_2D_ARRAY:n.TEXTURE_2D}function S(w,g,H,q,Z,ue=!1){if(w!==null){if(n[w]!==void 0)return n[w];Re("WebGLRenderer: Attempt to use non-existing WebGL internal format '"+w+"'")}let ge;q&&(ge=e.get("EXT_texture_norm16"),ge||Re("WebGLRenderer: Unable to use normalized textures without EXT_texture_norm16 extension"));let Q=g;if(g===n.RED&&(H===n.FLOAT&&(Q=n.R32F),H===n.HALF_FLOAT&&(Q=n.R16F),H===n.UNSIGNED_BYTE&&(Q=n.R8),H===n.UNSIGNED_SHORT&&ge&&(Q=ge.R16_EXT),H===n.SHORT&&ge&&(Q=ge.R16_SNORM_EXT)),g===n.RED_INTEGER&&(H===n.UNSIGNED_BYTE&&(Q=n.R8UI),H===n.UNSIGNED_SHORT&&(Q=n.R16UI),H===n.UNSIGNED_INT&&(Q=n.R32UI),H===n.BYTE&&(Q=n.R8I),H===n.SHORT&&(Q=n.R16I),H===n.INT&&(Q=n.R32I)),g===n.RG&&(H===n.FLOAT&&(Q=n.RG32F),H===n.HALF_FLOAT&&(Q=n.RG16F),H===n.UNSIGNED_BYTE&&(Q=n.RG8),H===n.UNSIGNED_SHORT&&ge&&(Q=ge.RG16_EXT),H===n.SHORT&&ge&&(Q=ge.RG16_SNORM_EXT)),g===n.RG_INTEGER&&(H===n.UNSIGNED_BYTE&&(Q=n.RG8UI),H===n.UNSIGNED_SHORT&&(Q=n.RG16UI),H===n.UNSIGNED_INT&&(Q=n.RG32UI),H===n.BYTE&&(Q=n.RG8I),H===n.SHORT&&(Q=n.RG16I),H===n.INT&&(Q=n.RG32I)),g===n.RGB_INTEGER&&(H===n.UNSIGNED_BYTE&&(Q=n.RGB8UI),H===n.UNSIGNED_SHORT&&(Q=n.RGB16UI),H===n.UNSIGNED_INT&&(Q=n.RGB32UI),H===n.BYTE&&(Q=n.RGB8I),H===n.SHORT&&(Q=n.RGB16I),H===n.INT&&(Q=n.RGB32I)),g===n.RGBA_INTEGER&&(H===n.UNSIGNED_BYTE&&(Q=n.RGBA8UI),H===n.UNSIGNED_SHORT&&(Q=n.RGBA16UI),H===n.UNSIGNED_INT&&(Q=n.RGBA32UI),H===n.BYTE&&(Q=n.RGBA8I),H===n.SHORT&&(Q=n.RGBA16I),H===n.INT&&(Q=n.RGBA32I)),g===n.RGB&&(H===n.UNSIGNED_SHORT&&ge&&(Q=ge.RGB16_EXT),H===n.SHORT&&ge&&(Q=ge.RGB16_SNORM_EXT),H===n.UNSIGNED_INT_5_9_9_9_REV&&(Q=n.RGB9_E5),H===n.UNSIGNED_INT_10F_11F_11F_REV&&(Q=n.R11F_G11F_B10F)),g===n.RGBA){let ie=ue?br:Ye.getTransfer(Z);H===n.FLOAT&&(Q=n.RGBA32F),H===n.HALF_FLOAT&&(Q=n.RGBA16F),H===n.UNSIGNED_BYTE&&(Q=ie===st?n.SRGB8_ALPHA8:n.RGBA8),H===n.UNSIGNED_SHORT&&ge&&(Q=ge.RGBA16_EXT),H===n.SHORT&&ge&&(Q=ge.RGBA16_SNORM_EXT),H===n.UNSIGNED_SHORT_4_4_4_4&&(Q=n.RGBA4),H===n.UNSIGNED_SHORT_5_5_5_1&&(Q=n.RGB5_A1)}return(Q===n.R16F||Q===n.R32F||Q===n.RG16F||Q===n.RG32F||Q===n.RGBA16F||Q===n.RGBA32F)&&e.get("EXT_color_buffer_float"),Q}function b(w,g){let H;return w?g===null||g===pi||g===Mr?H=n.DEPTH24_STENCIL8:g===Kt?H=n.DEPTH32F_STENCIL8:g===Cn&&(H=n.DEPTH24_STENCIL8,Re("DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.")):g===null||g===pi||g===Mr?H=n.DEPTH_COMPONENT24:g===Kt?H=n.DEPTH_COMPONENT32F:g===Cn&&(H=n.DEPTH_COMPONENT16),H}function T(w,g){return p(w)===!0||w.isFramebufferTexture&&w.minFilter!==Ut&&w.minFilter!==Bt?Math.log2(Math.max(g.width,g.height))+1:w.mipmaps!==void 0&&w.mipmaps.length>0?w.mipmaps.length:w.isCompressedTexture&&Array.isArray(w.image)?g.mipmaps.length:1}function P(w){let g=w.target;g.removeEventListener("dispose",P),A(g),g.isVideoTexture&&f.delete(g),g.isHTMLTexture&&h.delete(g)}function x(w){let g=w.target;g.removeEventListener("dispose",x),G(g)}function A(w){let g=i.get(w);if(g.__webglInit===void 0)return;let H=w.source,q=d.get(H);if(q){let Z=q[g.__cacheKey];Z.usedTimes--,Z.usedTimes===0&&D(w),Object.keys(q).length===0&&d.delete(H)}i.remove(w)}function D(w){let g=i.get(w);n.deleteTexture(g.__webglTexture);let H=w.source,q=d.get(H);delete q[g.__cacheKey],s.memory.textures--}function G(w){let g=i.get(w);if(w.depthTexture&&(w.depthTexture.dispose(),i.remove(w.depthTexture)),w.isWebGLCubeRenderTarget)for(let q=0;q<6;q++){if(Array.isArray(g.__webglFramebuffer[q]))for(let Z=0;Z<g.__webglFramebuffer[q].length;Z++)n.deleteFramebuffer(g.__webglFramebuffer[q][Z]);else n.deleteFramebuffer(g.__webglFramebuffer[q]);g.__webglDepthbuffer&&n.deleteRenderbuffer(g.__webglDepthbuffer[q])}else{if(Array.isArray(g.__webglFramebuffer))for(let q=0;q<g.__webglFramebuffer.length;q++)n.deleteFramebuffer(g.__webglFramebuffer[q]);else n.deleteFramebuffer(g.__webglFramebuffer);if(g.__webglDepthbuffer&&n.deleteRenderbuffer(g.__webglDepthbuffer),g.__webglMultisampledFramebuffer&&n.deleteFramebuffer(g.__webglMultisampledFramebuffer),g.__webglColorRenderbuffer)for(let q=0;q<g.__webglColorRenderbuffer.length;q++)g.__webglColorRenderbuffer[q]&&n.deleteRenderbuffer(g.__webglColorRenderbuffer[q]);g.__webglDepthRenderbuffer&&n.deleteRenderbuffer(g.__webglDepthRenderbuffer)}let H=w.textures;for(let q=0,Z=H.length;q<Z;q++){let ue=i.get(H[q]);ue.__webglTexture&&(n.deleteTexture(ue.__webglTexture),s.memory.textures--),i.remove(H[q])}i.remove(w)}let z=0;function Y(){z=0}function N(){return z}function F(w){z=w}function te(){let w=z;return w>=r.maxTextures&&Re("WebGLTextures: Trying to use "+(w+1)+" texture units while this GPU supports only "+r.maxTextures),z+=1,w}function $(w){let g=[];return g.push(w.wrapS),g.push(w.wrapT),g.push(w.wrapR||0),g.push(w.magFilter),g.push(w.minFilter),g.push(w.anisotropy),g.push(w.internalFormat),g.push(w.format),g.push(w.type),g.push(w.generateMipmaps),g.push(w.premultiplyAlpha),g.push(w.flipY),g.push(w.unpackAlignment),g.push(w.colorSpace),g.join()}function ae(w,g){let H=i.get(w);if(w.isVideoTexture&&B(w),w.isRenderTargetTexture===!1&&w.isExternalTexture!==!0&&w.version>0&&H.__version!==w.version){let q=w.image;if(q===null)Re("WebGLRenderer: Texture marked for update but no image data found.");else if(q.complete===!1)Re("WebGLRenderer: Texture marked for update but image is incomplete");else{pt(H,w,g);return}}else w.isExternalTexture&&(H.__webglTexture=w.sourceTexture?w.sourceTexture:null);t.bindTexture(n.TEXTURE_2D,H.__webglTexture,n.TEXTURE0+g)}function j(w,g){let H=i.get(w);if(w.isRenderTargetTexture===!1&&w.version>0&&H.__version!==w.version){pt(H,w,g);return}else w.isExternalTexture&&(H.__webglTexture=w.sourceTexture?w.sourceTexture:null);t.bindTexture(n.TEXTURE_2D_ARRAY,H.__webglTexture,n.TEXTURE0+g)}function re(w,g){let H=i.get(w);if(w.isRenderTargetTexture===!1&&w.version>0&&H.__version!==w.version){pt(H,w,g);return}t.bindTexture(n.TEXTURE_3D,H.__webglTexture,n.TEXTURE0+g)}function oe(w,g){let H=i.get(w);if(w.isCubeDepthTexture!==!0&&w.version>0&&H.__version!==w.version){Gt(H,w,g);return}t.bindTexture(n.TEXTURE_CUBE_MAP,H.__webglTexture,n.TEXTURE0+g)}let Ge={[xr]:n.REPEAT,[di]:n.CLAMP_TO_EDGE,[jo]:n.MIRRORED_REPEAT},Oe={[Ut]:n.NEAREST,[df]:n.NEAREST_MIPMAP_NEAREST,[es]:n.NEAREST_MIPMAP_LINEAR,[Bt]:n.LINEAR,[ga]:n.LINEAR_MIPMAP_NEAREST,[rn]:n.LINEAR_MIPMAP_LINEAR},Dt={[_f]:n.NEVER,[yf]:n.ALWAYS,[xf]:n.LESS,[io]:n.LEQUAL,[Mf]:n.EQUAL,[no]:n.GEQUAL,[vf]:n.GREATER,[Sf]:n.NOTEQUAL};function at(w,g){if(g.type===Kt&&e.has("OES_texture_float_linear")===!1&&(g.magFilter===Bt||g.magFilter===ga||g.magFilter===es||g.magFilter===rn||g.minFilter===Bt||g.minFilter===ga||g.minFilter===es||g.minFilter===rn)&&Re("WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device."),n.texParameteri(w,n.TEXTURE_WRAP_S,Ge[g.wrapS]),n.texParameteri(w,n.TEXTURE_WRAP_T,Ge[g.wrapT]),(w===n.TEXTURE_3D||w===n.TEXTURE_2D_ARRAY)&&n.texParameteri(w,n.TEXTURE_WRAP_R,Ge[g.wrapR]),n.texParameteri(w,n.TEXTURE_MAG_FILTER,Oe[g.magFilter]),n.texParameteri(w,n.TEXTURE_MIN_FILTER,Oe[g.minFilter]),g.compareFunction&&(n.texParameteri(w,n.TEXTURE_COMPARE_MODE,n.COMPARE_REF_TO_TEXTURE),n.texParameteri(w,n.TEXTURE_COMPARE_FUNC,Dt[g.compareFunction])),e.has("EXT_texture_filter_anisotropic")===!0){if(g.magFilter===Ut||g.minFilter!==es&&g.minFilter!==rn||g.type===Kt&&e.has("OES_texture_float_linear")===!1)return;if(g.anisotropy>1||i.get(g).__currentAnisotropy){let H=e.get("EXT_texture_filter_anisotropic");n.texParameterf(w,H.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(g.anisotropy,r.getMaxAnisotropy())),i.get(g).__currentAnisotropy=g.anisotropy}}}function ct(w,g){let H=!1;w.__webglInit===void 0&&(w.__webglInit=!0,g.addEventListener("dispose",P));let q=g.source,Z=d.get(q);Z===void 0&&(Z={},d.set(q,Z));let ue=$(g);if(ue!==w.__cacheKey){Z[ue]===void 0&&(Z[ue]={texture:n.createTexture(),usedTimes:0},s.memory.textures++,H=!0),Z[ue].usedTimes++;let ge=Z[w.__cacheKey];ge!==void 0&&(Z[w.__cacheKey].usedTimes--,ge.usedTimes===0&&D(g)),w.__cacheKey=ue,w.__webglTexture=Z[ue].texture}return H}function xt(w,g,H){return Math.floor(Math.floor(w/H)/g)}function ye(w,g,H,q){let ue=w.updateRanges;if(ue.length===0)t.texSubImage2D(n.TEXTURE_2D,0,0,0,g.width,g.height,H,q,g.data);else{ue.sort((Fe,_e)=>Fe.start-_e.start);let ge=0;for(let Fe=1;Fe<ue.length;Fe++){let _e=ue[ge],de=ue[Fe],Ue=_e.start+_e.count,ze=xt(de.start,g.width,4),ke=xt(_e.start,g.width,4);de.start<=Ue+1&&ze===ke&&xt(de.start+de.count-1,g.width,4)===ze?_e.count=Math.max(_e.count,de.start+de.count-_e.start):(++ge,ue[ge]=de)}ue.length=ge+1;let Q=t.getParameter(n.UNPACK_ROW_LENGTH),ie=t.getParameter(n.UNPACK_SKIP_PIXELS),pe=t.getParameter(n.UNPACK_SKIP_ROWS);t.pixelStorei(n.UNPACK_ROW_LENGTH,g.width);for(let Fe=0,_e=ue.length;Fe<_e;Fe++){let de=ue[Fe],Ue=Math.floor(de.start/4),ze=Math.ceil(de.count/4),ke=Ue%g.width,O=Math.floor(Ue/g.width),me=ze,ee=1;t.pixelStorei(n.UNPACK_SKIP_PIXELS,ke),t.pixelStorei(n.UNPACK_SKIP_ROWS,O),t.texSubImage2D(n.TEXTURE_2D,0,ke,O,me,ee,H,q,g.data)}w.clearUpdateRanges(),t.pixelStorei(n.UNPACK_ROW_LENGTH,Q),t.pixelStorei(n.UNPACK_SKIP_PIXELS,ie),t.pixelStorei(n.UNPACK_SKIP_ROWS,pe)}}function pt(w,g,H){let q=n.TEXTURE_2D;(g.isDataArrayTexture||g.isCompressedArrayTexture)&&(q=n.TEXTURE_2D_ARRAY),g.isData3DTexture&&(q=n.TEXTURE_3D);let Z=ct(w,g),ue=g.source;t.bindTexture(q,w.__webglTexture,n.TEXTURE0+H);let ge=i.get(ue);if(ue.version!==ge.__version||Z===!0){if(t.activeTexture(n.TEXTURE0+H),(typeof ImageBitmap<"u"&&g.image instanceof ImageBitmap)===!1){let ee=Ye.getPrimaries(Ye.workingColorSpace),he=g.colorSpace===Yi?null:Ye.getPrimaries(g.colorSpace),Se=g.colorSpace===Yi||ee===he?n.NONE:n.BROWSER_DEFAULT_WEBGL;t.pixelStorei(n.UNPACK_FLIP_Y_WEBGL,g.flipY),t.pixelStorei(n.UNPACK_PREMULTIPLY_ALPHA_WEBGL,g.premultiplyAlpha),t.pixelStorei(n.UNPACK_COLORSPACE_CONVERSION_WEBGL,Se)}t.pixelStorei(n.UNPACK_ALIGNMENT,g.unpackAlignment);let ie=m(g.image,!1,r.maxTextureSize);ie=ui(g,ie);let pe=o.convert(g.format,g.colorSpace),Fe=o.convert(g.type),_e=S(g.internalFormat,pe,Fe,g.normalized,g.colorSpace,g.isVideoTexture);at(q,g);let de,Ue=g.mipmaps,ze=g.isVideoTexture!==!0,ke=ge.__version===void 0||Z===!0,O=ue.dataReady,me=T(g,ie);if(g.isDepthTexture)_e=b(g.format===Pn,g.type),ke&&(ze?t.texStorage2D(n.TEXTURE_2D,1,_e,ie.width,ie.height):t.texImage2D(n.TEXTURE_2D,0,_e,ie.width,ie.height,0,pe,Fe,null));else if(g.isDataTexture)if(Ue.length>0){ze&&ke&&t.texStorage2D(n.TEXTURE_2D,me,_e,Ue[0].width,Ue[0].height);for(let ee=0,he=Ue.length;ee<he;ee++)de=Ue[ee],ze?O&&t.texSubImage2D(n.TEXTURE_2D,ee,0,0,de.width,de.height,pe,Fe,de.data):t.texImage2D(n.TEXTURE_2D,ee,_e,de.width,de.height,0,pe,Fe,de.data);g.generateMipmaps=!1}else ze?(ke&&t.texStorage2D(n.TEXTURE_2D,me,_e,ie.width,ie.height),O&&ye(g,ie,pe,Fe)):t.texImage2D(n.TEXTURE_2D,0,_e,ie.width,ie.height,0,pe,Fe,ie.data);else if(g.isCompressedTexture)if(g.isCompressedArrayTexture){ze&&ke&&t.texStorage3D(n.TEXTURE_2D_ARRAY,me,_e,Ue[0].width,Ue[0].height,ie.depth);for(let ee=0,he=Ue.length;ee<he;ee++)if(de=Ue[ee],g.format!==Ci)if(pe!==null)if(ze){if(O)if(g.layerUpdates.size>0){let Se=fc(de.width,de.height,g.format,g.type);for(let se of g.layerUpdates){let Ce=de.data.subarray(se*Se/de.data.BYTES_PER_ELEMENT,(se+1)*Se/de.data.BYTES_PER_ELEMENT);t.compressedTexSubImage3D(n.TEXTURE_2D_ARRAY,ee,0,0,se,de.width,de.height,1,pe,Ce)}}else t.compressedTexSubImage3D(n.TEXTURE_2D_ARRAY,ee,0,0,0,de.width,de.height,ie.depth,pe,de.data)}else t.compressedTexImage3D(n.TEXTURE_2D_ARRAY,ee,_e,de.width,de.height,ie.depth,0,de.data,0,0);else Re("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()");else ze?O&&t.texSubImage3D(n.TEXTURE_2D_ARRAY,ee,0,0,0,de.width,de.height,ie.depth,pe,Fe,de.data):t.texImage3D(n.TEXTURE_2D_ARRAY,ee,_e,de.width,de.height,ie.depth,0,pe,Fe,de.data);g.layerUpdates.size>0&&g.clearLayerUpdates()}else{ze&&ke&&t.texStorage2D(n.TEXTURE_2D,me,_e,Ue[0].width,Ue[0].height);for(let ee=0,he=Ue.length;ee<he;ee++)de=Ue[ee],g.format!==Ci?pe!==null?ze?O&&t.compressedTexSubImage2D(n.TEXTURE_2D,ee,0,0,de.width,de.height,pe,de.data):t.compressedTexImage2D(n.TEXTURE_2D,ee,_e,de.width,de.height,0,de.data):Re("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"):ze?O&&t.texSubImage2D(n.TEXTURE_2D,ee,0,0,de.width,de.height,pe,Fe,de.data):t.texImage2D(n.TEXTURE_2D,ee,_e,de.width,de.height,0,pe,Fe,de.data)}else if(g.isDataArrayTexture)if(ze){if(ke&&t.texStorage3D(n.TEXTURE_2D_ARRAY,me,_e,ie.width,ie.height,ie.depth),O)if(g.layerUpdates.size>0){let ee=fc(ie.width,ie.height,g.format,g.type);for(let he of g.layerUpdates){let Se=ie.data.subarray(he*ee/ie.data.BYTES_PER_ELEMENT,(he+1)*ee/ie.data.BYTES_PER_ELEMENT);t.texSubImage3D(n.TEXTURE_2D_ARRAY,0,0,0,he,ie.width,ie.height,1,pe,Fe,Se)}g.clearLayerUpdates()}else t.texSubImage3D(n.TEXTURE_2D_ARRAY,0,0,0,0,ie.width,ie.height,ie.depth,pe,Fe,ie.data)}else t.texImage3D(n.TEXTURE_2D_ARRAY,0,_e,ie.width,ie.height,ie.depth,0,pe,Fe,ie.data);else if(g.isData3DTexture)ze?(ke&&t.texStorage3D(n.TEXTURE_3D,me,_e,ie.width,ie.height,ie.depth),O&&t.texSubImage3D(n.TEXTURE_3D,0,0,0,0,ie.width,ie.height,ie.depth,pe,Fe,ie.data)):t.texImage3D(n.TEXTURE_3D,0,_e,ie.width,ie.height,ie.depth,0,pe,Fe,ie.data);else if(g.isFramebufferTexture){if(ke)if(ze)t.texStorage2D(n.TEXTURE_2D,me,_e,ie.width,ie.height);else{let ee=ie.width,he=ie.height;for(let Se=0;Se<me;Se++)t.texImage2D(n.TEXTURE_2D,Se,_e,ee,he,0,pe,Fe,null),ee>>=1,he>>=1}}else if(g.isHTMLTexture){if("texElementImage2D"in n){let ee=n.canvas;if(ee.hasAttribute("layoutsubtree")||ee.setAttribute("layoutsubtree","true"),ie.parentNode!==ee){ee.appendChild(ie),h.add(g),ee.onpaint=he=>{let Se=he.changedElements;for(let se of h)Se.includes(se.image)&&(se.needsUpdate=!0)},ee.requestPaint();return}if(n.texElementImage2D.length===3)n.texElementImage2D(n.TEXTURE_2D,n.RGBA8,ie);else{let Se=n.RGBA,se=n.RGBA,Ce=n.UNSIGNED_BYTE;n.texElementImage2D(n.TEXTURE_2D,0,Se,se,Ce,ie)}n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE)}}else if(Ue.length>0){if(ze&&ke){let ee=vt(Ue[0]);t.texStorage2D(n.TEXTURE_2D,me,_e,ee.width,ee.height)}for(let ee=0,he=Ue.length;ee<he;ee++)de=Ue[ee],ze?O&&t.texSubImage2D(n.TEXTURE_2D,ee,0,0,pe,Fe,de):t.texImage2D(n.TEXTURE_2D,ee,_e,pe,Fe,de);g.generateMipmaps=!1}else if(ze){if(ke){let ee=vt(ie);t.texStorage2D(n.TEXTURE_2D,me,_e,ee.width,ee.height)}O&&t.texSubImage2D(n.TEXTURE_2D,0,0,0,pe,Fe,ie)}else t.texImage2D(n.TEXTURE_2D,0,_e,pe,Fe,ie);p(g)&&E(q),ge.__version=ue.version,g.onUpdate&&g.onUpdate(g)}w.__version=g.version}function Gt(w,g,H){if(g.image.length!==6)return;let q=ct(w,g),Z=g.source;t.bindTexture(n.TEXTURE_CUBE_MAP,w.__webglTexture,n.TEXTURE0+H);let ue=i.get(Z);if(Z.version!==ue.__version||q===!0){t.activeTexture(n.TEXTURE0+H);let ge=Ye.getPrimaries(Ye.workingColorSpace),Q=g.colorSpace===Yi?null:Ye.getPrimaries(g.colorSpace),ie=g.colorSpace===Yi||ge===Q?n.NONE:n.BROWSER_DEFAULT_WEBGL;t.pixelStorei(n.UNPACK_FLIP_Y_WEBGL,g.flipY),t.pixelStorei(n.UNPACK_PREMULTIPLY_ALPHA_WEBGL,g.premultiplyAlpha),t.pixelStorei(n.UNPACK_ALIGNMENT,g.unpackAlignment),t.pixelStorei(n.UNPACK_COLORSPACE_CONVERSION_WEBGL,ie);let pe=g.isCompressedTexture||g.image[0].isCompressedTexture,Fe=g.image[0]&&g.image[0].isDataTexture,_e=[];for(let se=0;se<6;se++)!pe&&!Fe?_e[se]=m(g.image[se],!0,r.maxCubemapSize):_e[se]=Fe?g.image[se].image:g.image[se],_e[se]=ui(g,_e[se]);let de=_e[0],Ue=o.convert(g.format,g.colorSpace),ze=o.convert(g.type),ke=S(g.internalFormat,Ue,ze,g.normalized,g.colorSpace),O=g.isVideoTexture!==!0,me=ue.__version===void 0||q===!0,ee=Z.dataReady,he=T(g,de);at(n.TEXTURE_CUBE_MAP,g);let Se;if(pe){O&&me&&t.texStorage2D(n.TEXTURE_CUBE_MAP,he,ke,de.width,de.height);for(let se=0;se<6;se++){Se=_e[se].mipmaps;for(let Ce=0;Ce<Se.length;Ce++){let Le=Se[Ce];g.format!==Ci?Ue!==null?O?ee&&t.compressedTexSubImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+se,Ce,0,0,Le.width,Le.height,Ue,Le.data):t.compressedTexImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+se,Ce,ke,Le.width,Le.height,0,Le.data):Re("WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()"):O?ee&&t.texSubImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+se,Ce,0,0,Le.width,Le.height,Ue,ze,Le.data):t.texImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+se,Ce,ke,Le.width,Le.height,0,Ue,ze,Le.data)}}}else{if(Se=g.mipmaps,O&&me){Se.length>0&&he++;let se=vt(_e[0]);t.texStorage2D(n.TEXTURE_CUBE_MAP,he,ke,se.width,se.height)}for(let se=0;se<6;se++)if(Fe){O?ee&&t.texSubImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+se,0,0,0,_e[se].width,_e[se].height,Ue,ze,_e[se].data):t.texImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+se,0,ke,_e[se].width,_e[se].height,0,Ue,ze,_e[se].data);for(let Ce=0;Ce<Se.length;Ce++){let ot=Se[Ce].image[se].image;O?ee&&t.texSubImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+se,Ce+1,0,0,ot.width,ot.height,Ue,ze,ot.data):t.texImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+se,Ce+1,ke,ot.width,ot.height,0,Ue,ze,ot.data)}}else{O?ee&&t.texSubImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+se,0,0,0,Ue,ze,_e[se]):t.texImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+se,0,ke,Ue,ze,_e[se]);for(let Ce=0;Ce<Se.length;Ce++){let Le=Se[Ce];O?ee&&t.texSubImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+se,Ce+1,0,0,Ue,ze,Le.image[se]):t.texImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+se,Ce+1,ke,Ue,ze,Le.image[se])}}}p(g)&&E(n.TEXTURE_CUBE_MAP),ue.__version=Z.version,g.onUpdate&&g.onUpdate(g)}w.__version=g.version}function Ie(w,g,H,q,Z,ue){let ge=o.convert(H.format,H.colorSpace),Q=o.convert(H.type),ie=S(H.internalFormat,ge,Q,H.normalized,H.colorSpace),pe=i.get(g),Fe=i.get(H);if(Fe.__renderTarget=g,!pe.__hasExternalTextures){let _e=Math.max(1,g.width>>ue),de=Math.max(1,g.height>>ue);Z===n.TEXTURE_3D||Z===n.TEXTURE_2D_ARRAY?t.texImage3D(Z,ue,ie,_e,de,g.depth,0,ge,Q,null):t.texImage2D(Z,ue,ie,_e,de,0,ge,Q,null)}t.bindFramebuffer(n.FRAMEBUFFER,w),Ht(g)?a.framebufferTexture2DMultisampleEXT(n.FRAMEBUFFER,q,Z,Fe.__webglTexture,0,Xt(g)):(Z===n.TEXTURE_2D||Z>=n.TEXTURE_CUBE_MAP_POSITIVE_X&&Z<=n.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&n.framebufferTexture2D(n.FRAMEBUFFER,q,Z,Fe.__webglTexture,ue),t.bindFramebuffer(n.FRAMEBUFFER,null)}function Et(w,g,H){if(n.bindRenderbuffer(n.RENDERBUFFER,w),g.depthBuffer){let q=g.depthTexture,Z=q&&q.isDepthTexture?q.type:null,ue=b(g.stencilBuffer,Z),ge=g.stencilBuffer?n.DEPTH_STENCIL_ATTACHMENT:n.DEPTH_ATTACHMENT;Ht(g)?a.renderbufferStorageMultisampleEXT(n.RENDERBUFFER,Xt(g),ue,g.width,g.height):H?n.renderbufferStorageMultisample(n.RENDERBUFFER,Xt(g),ue,g.width,g.height):n.renderbufferStorage(n.RENDERBUFFER,ue,g.width,g.height),n.framebufferRenderbuffer(n.FRAMEBUFFER,ge,n.RENDERBUFFER,w)}else{let q=g.textures;for(let Z=0;Z<q.length;Z++){let ue=q[Z],ge=o.convert(ue.format,ue.colorSpace),Q=o.convert(ue.type),ie=S(ue.internalFormat,ge,Q,ue.normalized,ue.colorSpace);Ht(g)?a.renderbufferStorageMultisampleEXT(n.RENDERBUFFER,Xt(g),ie,g.width,g.height):H?n.renderbufferStorageMultisample(n.RENDERBUFFER,Xt(g),ie,g.width,g.height):n.renderbufferStorage(n.RENDERBUFFER,ie,g.width,g.height)}}n.bindRenderbuffer(n.RENDERBUFFER,null)}function ci(w,g,H){let q=g.isWebGLCubeRenderTarget===!0;if(t.bindFramebuffer(n.FRAMEBUFFER,w),!(g.depthTexture&&g.depthTexture.isDepthTexture))throw new Error("THREE.WebGLTextures: renderTarget.depthTexture must be an instance of THREE.DepthTexture.");let Z=i.get(g.depthTexture);if(Z.__renderTarget=g,(!Z.__webglTexture||g.depthTexture.image.width!==g.width||g.depthTexture.image.height!==g.height)&&(g.depthTexture.image.width=g.width,g.depthTexture.image.height=g.height,g.depthTexture.needsUpdate=!0),q){if(Z.__webglInit===void 0&&(Z.__webglInit=!0,g.depthTexture.addEventListener("dispose",P)),Z.__webglTexture===void 0){Z.__webglTexture=n.createTexture(),t.bindTexture(n.TEXTURE_CUBE_MAP,Z.__webglTexture),at(n.TEXTURE_CUBE_MAP,g.depthTexture);let pe=o.convert(g.depthTexture.format),Fe=o.convert(g.depthTexture.type),_e;g.depthTexture.format===Gi?_e=n.DEPTH_COMPONENT24:g.depthTexture.format===Pn&&(_e=n.DEPTH24_STENCIL8);for(let de=0;de<6;de++)n.texImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+de,0,_e,g.width,g.height,0,pe,Fe,null)}}else ae(g.depthTexture,0);let ue=Z.__webglTexture,ge=Xt(g),Q=q?n.TEXTURE_CUBE_MAP_POSITIVE_X+H:n.TEXTURE_2D,ie=g.depthTexture.format===Pn?n.DEPTH_STENCIL_ATTACHMENT:n.DEPTH_ATTACHMENT;if(g.depthTexture.format===Gi)Ht(g)?a.framebufferTexture2DMultisampleEXT(n.FRAMEBUFFER,ie,Q,ue,0,ge):n.framebufferTexture2D(n.FRAMEBUFFER,ie,Q,ue,0);else if(g.depthTexture.format===Pn)Ht(g)?a.framebufferTexture2DMultisampleEXT(n.FRAMEBUFFER,ie,Q,ue,0,ge):n.framebufferTexture2D(n.FRAMEBUFFER,ie,Q,ue,0);else throw new Error("THREE.WebGLTextures: Unknown depthTexture format.")}function si(w){let g=i.get(w),H=w.isWebGLCubeRenderTarget===!0;if(g.__boundDepthTexture!==w.depthTexture){let q=w.depthTexture;if(g.__depthDisposeCallback&&g.__depthDisposeCallback(),q){let Z=()=>{delete g.__boundDepthTexture,delete g.__depthDisposeCallback,q.removeEventListener("dispose",Z)};q.addEventListener("dispose",Z),g.__depthDisposeCallback=Z}g.__boundDepthTexture=q}if(w.depthTexture&&!g.__autoAllocateDepthBuffer)if(H)for(let q=0;q<6;q++)ci(g.__webglFramebuffer[q],w,q);else{let q=w.texture.mipmaps;q&&q.length>0?ci(g.__webglFramebuffer[0],w,0):ci(g.__webglFramebuffer,w,0)}else if(H){g.__webglDepthbuffer=[];for(let q=0;q<6;q++)if(t.bindFramebuffer(n.FRAMEBUFFER,g.__webglFramebuffer[q]),g.__webglDepthbuffer[q]===void 0)g.__webglDepthbuffer[q]=n.createRenderbuffer(),Et(g.__webglDepthbuffer[q],w,!1);else{let Z=w.stencilBuffer?n.DEPTH_STENCIL_ATTACHMENT:n.DEPTH_ATTACHMENT,ue=g.__webglDepthbuffer[q];n.bindRenderbuffer(n.RENDERBUFFER,ue),n.framebufferRenderbuffer(n.FRAMEBUFFER,Z,n.RENDERBUFFER,ue)}}else{let q=w.texture.mipmaps;if(q&&q.length>0?t.bindFramebuffer(n.FRAMEBUFFER,g.__webglFramebuffer[0]):t.bindFramebuffer(n.FRAMEBUFFER,g.__webglFramebuffer),g.__webglDepthbuffer===void 0)g.__webglDepthbuffer=n.createRenderbuffer(),Et(g.__webglDepthbuffer,w,!1);else{let Z=w.stencilBuffer?n.DEPTH_STENCIL_ATTACHMENT:n.DEPTH_ATTACHMENT,ue=g.__webglDepthbuffer;n.bindRenderbuffer(n.RENDERBUFFER,ue),n.framebufferRenderbuffer(n.FRAMEBUFFER,Z,n.RENDERBUFFER,ue)}}t.bindFramebuffer(n.FRAMEBUFFER,null)}function zt(w,g,H){let q=i.get(w);g!==void 0&&Ie(q.__webglFramebuffer,w,w.texture,n.COLOR_ATTACHMENT0,n.TEXTURE_2D,0),H!==void 0&&si(w)}function bi(w){let g=w.texture,H=i.get(w),q=i.get(g);w.addEventListener("dispose",x);let Z=w.textures,ue=w.isWebGLCubeRenderTarget===!0,ge=Z.length>1;if(ge||(q.__webglTexture===void 0&&(q.__webglTexture=n.createTexture()),q.__version=g.version,s.memory.textures++),ue){H.__webglFramebuffer=[];for(let Q=0;Q<6;Q++)if(g.mipmaps&&g.mipmaps.length>0){H.__webglFramebuffer[Q]=[];for(let ie=0;ie<g.mipmaps.length;ie++)H.__webglFramebuffer[Q][ie]=n.createFramebuffer()}else H.__webglFramebuffer[Q]=n.createFramebuffer()}else{if(g.mipmaps&&g.mipmaps.length>0){H.__webglFramebuffer=[];for(let Q=0;Q<g.mipmaps.length;Q++)H.__webglFramebuffer[Q]=n.createFramebuffer()}else H.__webglFramebuffer=n.createFramebuffer();if(ge)for(let Q=0,ie=Z.length;Q<ie;Q++){let pe=i.get(Z[Q]);pe.__webglTexture===void 0&&(pe.__webglTexture=n.createTexture(),s.memory.textures++)}if(w.samples>0&&Ht(w)===!1){H.__webglMultisampledFramebuffer=n.createFramebuffer(),H.__webglColorRenderbuffer=[],t.bindFramebuffer(n.FRAMEBUFFER,H.__webglMultisampledFramebuffer);for(let Q=0;Q<Z.length;Q++){let ie=Z[Q];H.__webglColorRenderbuffer[Q]=n.createRenderbuffer(),n.bindRenderbuffer(n.RENDERBUFFER,H.__webglColorRenderbuffer[Q]);let pe=o.convert(ie.format,ie.colorSpace),Fe=o.convert(ie.type),_e=S(ie.internalFormat,pe,Fe,ie.normalized,ie.colorSpace,w.isXRRenderTarget===!0),de=Xt(w);n.renderbufferStorageMultisample(n.RENDERBUFFER,de,_e,w.width,w.height),n.framebufferRenderbuffer(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0+Q,n.RENDERBUFFER,H.__webglColorRenderbuffer[Q])}n.bindRenderbuffer(n.RENDERBUFFER,null),w.depthBuffer&&(H.__webglDepthRenderbuffer=n.createRenderbuffer(),Et(H.__webglDepthRenderbuffer,w,!0)),t.bindFramebuffer(n.FRAMEBUFFER,null)}}if(ue){t.bindTexture(n.TEXTURE_CUBE_MAP,q.__webglTexture),at(n.TEXTURE_CUBE_MAP,g);for(let Q=0;Q<6;Q++)if(g.mipmaps&&g.mipmaps.length>0)for(let ie=0;ie<g.mipmaps.length;ie++)Ie(H.__webglFramebuffer[Q][ie],w,g,n.COLOR_ATTACHMENT0,n.TEXTURE_CUBE_MAP_POSITIVE_X+Q,ie);else Ie(H.__webglFramebuffer[Q],w,g,n.COLOR_ATTACHMENT0,n.TEXTURE_CUBE_MAP_POSITIVE_X+Q,0);p(g)&&E(n.TEXTURE_CUBE_MAP),t.unbindTexture()}else if(ge){for(let Q=0,ie=Z.length;Q<ie;Q++){let pe=Z[Q],Fe=i.get(pe),_e=n.TEXTURE_2D;(w.isWebGL3DRenderTarget||w.isWebGLArrayRenderTarget)&&(_e=w.isWebGL3DRenderTarget?n.TEXTURE_3D:n.TEXTURE_2D_ARRAY),t.bindTexture(_e,Fe.__webglTexture),at(_e,pe),Ie(H.__webglFramebuffer,w,pe,n.COLOR_ATTACHMENT0+Q,_e,0),p(pe)&&E(_e)}t.unbindTexture()}else{let Q=n.TEXTURE_2D;if((w.isWebGL3DRenderTarget||w.isWebGLArrayRenderTarget)&&(Q=w.isWebGL3DRenderTarget?n.TEXTURE_3D:n.TEXTURE_2D_ARRAY),t.bindTexture(Q,q.__webglTexture),at(Q,g),g.mipmaps&&g.mipmaps.length>0)for(let ie=0;ie<g.mipmaps.length;ie++)Ie(H.__webglFramebuffer[ie],w,g,n.COLOR_ATTACHMENT0,Q,ie);else Ie(H.__webglFramebuffer,w,g,n.COLOR_ATTACHMENT0,Q,0);p(g)&&E(Q),t.unbindTexture()}w.depthBuffer&&si(w)}function Di(w){let g=w.textures;for(let H=0,q=g.length;H<q;H++){let Z=g[H];if(p(Z)){let ue=C(w),ge=i.get(Z).__webglTexture;t.bindTexture(ue,ge),E(ue),t.unbindTexture()}}}let Yt=[],Wt=[];function fi(w){if(w.samples>0){if(Ht(w)===!1){let g=w.textures,H=w.width,q=w.height,Z=n.COLOR_BUFFER_BIT,ue=w.stencilBuffer?n.DEPTH_STENCIL_ATTACHMENT:n.DEPTH_ATTACHMENT,ge=i.get(w),Q=g.length>1;if(Q)for(let pe=0;pe<g.length;pe++)t.bindFramebuffer(n.FRAMEBUFFER,ge.__webglMultisampledFramebuffer),n.framebufferRenderbuffer(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0+pe,n.RENDERBUFFER,null),t.bindFramebuffer(n.FRAMEBUFFER,ge.__webglFramebuffer),n.framebufferTexture2D(n.DRAW_FRAMEBUFFER,n.COLOR_ATTACHMENT0+pe,n.TEXTURE_2D,null,0);t.bindFramebuffer(n.READ_FRAMEBUFFER,ge.__webglMultisampledFramebuffer);let ie=w.texture.mipmaps;ie&&ie.length>0?t.bindFramebuffer(n.DRAW_FRAMEBUFFER,ge.__webglFramebuffer[0]):t.bindFramebuffer(n.DRAW_FRAMEBUFFER,ge.__webglFramebuffer);for(let pe=0;pe<g.length;pe++){if(w.resolveDepthBuffer&&(w.depthBuffer&&(Z|=n.DEPTH_BUFFER_BIT),w.stencilBuffer&&w.resolveStencilBuffer&&(Z|=n.STENCIL_BUFFER_BIT)),Q){n.framebufferRenderbuffer(n.READ_FRAMEBUFFER,n.COLOR_ATTACHMENT0,n.RENDERBUFFER,ge.__webglColorRenderbuffer[pe]);let Fe=i.get(g[pe]).__webglTexture;n.framebufferTexture2D(n.DRAW_FRAMEBUFFER,n.COLOR_ATTACHMENT0,n.TEXTURE_2D,Fe,0)}n.blitFramebuffer(0,0,H,q,0,0,H,q,Z,n.NEAREST),c===!0&&(Yt.length=0,Wt.length=0,Yt.push(n.COLOR_ATTACHMENT0+pe),w.depthBuffer&&w.storeMultisampledDepthBuffer===!1&&(Yt.push(ue),Wt.push(ue),n.invalidateFramebuffer(n.DRAW_FRAMEBUFFER,Wt)),n.invalidateFramebuffer(n.READ_FRAMEBUFFER,Yt))}if(t.bindFramebuffer(n.READ_FRAMEBUFFER,null),t.bindFramebuffer(n.DRAW_FRAMEBUFFER,null),Q)for(let pe=0;pe<g.length;pe++){t.bindFramebuffer(n.FRAMEBUFFER,ge.__webglMultisampledFramebuffer),n.framebufferRenderbuffer(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0+pe,n.RENDERBUFFER,ge.__webglColorRenderbuffer[pe]);let Fe=i.get(g[pe]).__webglTexture;t.bindFramebuffer(n.FRAMEBUFFER,ge.__webglFramebuffer),n.framebufferTexture2D(n.DRAW_FRAMEBUFFER,n.COLOR_ATTACHMENT0+pe,n.TEXTURE_2D,Fe,0)}t.bindFramebuffer(n.DRAW_FRAMEBUFFER,ge.__webglMultisampledFramebuffer)}else if(w.depthBuffer&&w.storeMultisampledDepthBuffer===!1&&c){let g=w.stencilBuffer?n.DEPTH_STENCIL_ATTACHMENT:n.DEPTH_ATTACHMENT;n.invalidateFramebuffer(n.DRAW_FRAMEBUFFER,[g])}}}function Xt(w){return Math.min(r.maxSamples,w.samples)}function Ht(w){let g=i.get(w);return w.samples>0&&e.has("WEBGL_multisampled_render_to_texture")===!0&&g.__useRenderToTexture!==!1}function B(w){let g=s.render.frame;f.get(w)!==g&&(f.set(w,g),w.update())}function ui(w,g){let H=w.colorSpace,q=w.format,Z=w.type;return w.isCompressedTexture===!0||w.isVideoTexture===!0||H!==Er&&H!==Yi&&(Ye.getTransfer(H)===st?(q!==Ci||Z!==Qt)&&Re("WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType."):Qe("WebGLTextures: Unsupported texture color space:",H)),g}function vt(w){return typeof HTMLImageElement<"u"&&w instanceof HTMLImageElement?(l.width=w.naturalWidth||w.width,l.height=w.naturalHeight||w.height):typeof VideoFrame<"u"&&w instanceof VideoFrame?(l.width=w.displayWidth,l.height=w.displayHeight):(l.width=w.width,l.height=w.height),l}this.allocateTextureUnit=te,this.resetTextureUnits=Y,this.getTextureUnits=N,this.setTextureUnits=F,this.setTexture2D=ae,this.setTexture2DArray=j,this.setTexture3D=re,this.setTextureCube=oe,this.rebindTextures=zt,this.setupRenderTarget=bi,this.updateRenderTargetMipmap=Di,this.updateMultisampleRenderTarget=fi,this.setupDepthRenderbuffer=si,this.setupFrameBufferTexture=Ie,this.useMultisampledRTT=Ht,this.isReversedDepthBuffer=function(){return t.buffers.depth.getReversed()}}function zp(n,e){function t(i,r=Yi){let o,s=Ye.getTransfer(r);if(i===Qt)return n.UNSIGNED_BYTE;if(i===qr)return n.UNSIGNED_SHORT_4_4_4_4;if(i===Yr)return n.UNSIGNED_SHORT_5_5_5_1;if(i===Ma)return n.UNSIGNED_INT_5_9_9_9_REV;if(i===va)return n.UNSIGNED_INT_10F_11F_11F_REV;if(i===_a)return n.BYTE;if(i===xa)return n.SHORT;if(i===Cn)return n.UNSIGNED_SHORT;if(i===Xr)return n.INT;if(i===pi)return n.UNSIGNED_INT;if(i===Kt)return n.FLOAT;if(i===jt)return n.HALF_FLOAT;if(i===Sa)return n.ALPHA;if(i===ya)return n.RGB;if(i===Ci)return n.RGBA;if(i===Gi)return n.DEPTH_COMPONENT;if(i===Pn)return n.DEPTH_STENCIL;if(i===Zr)return n.RED;if(i===Kr)return n.RED_INTEGER;if(i===zi)return n.RG;if(i===Jr)return n.RG_INTEGER;if(i===$r)return n.RGBA_INTEGER;if(i===Qr||i===jr||i===eo||i===to)if(s===st)if(o=e.get("WEBGL_compressed_texture_s3tc_srgb"),o!==null){if(i===Qr)return o.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(i===jr)return o.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(i===eo)return o.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(i===to)return o.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null;else if(o=e.get("WEBGL_compressed_texture_s3tc"),o!==null){if(i===Qr)return o.COMPRESSED_RGB_S3TC_DXT1_EXT;if(i===jr)return o.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(i===eo)return o.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(i===to)return o.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null;if(i===ts||i===is||i===ns||i===rs)if(o=e.get("WEBGL_compressed_texture_pvrtc"),o!==null){if(i===ts)return o.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(i===is)return o.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(i===ns)return o.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(i===rs)return o.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null;if(i===os||i===ss||i===as||i===ls||i===cs||i===vr||i===fs)if(o=e.get("WEBGL_compressed_texture_etc"),o!==null){if(i===os||i===ss)return s===st?o.COMPRESSED_SRGB8_ETC2:o.COMPRESSED_RGB8_ETC2;if(i===as)return s===st?o.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:o.COMPRESSED_RGBA8_ETC2_EAC;if(i===ls)return o.COMPRESSED_R11_EAC;if(i===cs)return o.COMPRESSED_SIGNED_R11_EAC;if(i===vr)return o.COMPRESSED_RG11_EAC;if(i===fs)return o.COMPRESSED_SIGNED_RG11_EAC}else return null;if(i===us||i===hs||i===ds||i===ps||i===ms||i===gs||i===_s||i===xs||i===Ms||i===vs||i===Ss||i===ys||i===Es||i===bs)if(o=e.get("WEBGL_compressed_texture_astc"),o!==null){if(i===us)return s===st?o.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:o.COMPRESSED_RGBA_ASTC_4x4_KHR;if(i===hs)return s===st?o.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:o.COMPRESSED_RGBA_ASTC_5x4_KHR;if(i===ds)return s===st?o.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:o.COMPRESSED_RGBA_ASTC_5x5_KHR;if(i===ps)return s===st?o.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:o.COMPRESSED_RGBA_ASTC_6x5_KHR;if(i===ms)return s===st?o.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:o.COMPRESSED_RGBA_ASTC_6x6_KHR;if(i===gs)return s===st?o.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:o.COMPRESSED_RGBA_ASTC_8x5_KHR;if(i===_s)return s===st?o.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:o.COMPRESSED_RGBA_ASTC_8x6_KHR;if(i===xs)return s===st?o.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:o.COMPRESSED_RGBA_ASTC_8x8_KHR;if(i===Ms)return s===st?o.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:o.COMPRESSED_RGBA_ASTC_10x5_KHR;if(i===vs)return s===st?o.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:o.COMPRESSED_RGBA_ASTC_10x6_KHR;if(i===Ss)return s===st?o.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:o.COMPRESSED_RGBA_ASTC_10x8_KHR;if(i===ys)return s===st?o.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:o.COMPRESSED_RGBA_ASTC_10x10_KHR;if(i===Es)return s===st?o.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:o.COMPRESSED_RGBA_ASTC_12x10_KHR;if(i===bs)return s===st?o.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:o.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null;if(i===Ts||i===As||i===ws)if(o=e.get("EXT_texture_compression_bptc"),o!==null){if(i===Ts)return s===st?o.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:o.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(i===As)return o.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(i===ws)return o.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null;if(i===Rs||i===Cs||i===Sr||i===Ps)if(o=e.get("EXT_texture_compression_rgtc"),o!==null){if(i===Rs)return o.COMPRESSED_RED_RGTC1_EXT;if(i===Cs)return o.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(i===Sr)return o.COMPRESSED_RED_GREEN_RGTC2_EXT;if(i===Ps)return o.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null;return i===Mr?n.UNSIGNED_INT_24_8:n[i]!==void 0?n[i]:null}return{convert:t}}var xl=class extends mi{constructor(){super(),this.enabled=!1,this.isPresenting=!1,this.cameraAutoUpdate=!0}getEnvironmentBlendMode(){}setAnimationLoop(){}dispose(){}updateCamera(){}getCamera(){}hasDepthSensing(){return!1}getDepthSensingMesh(){return null}};var Wg=new Ze,Vp=new Be;Vp.set(-1,0,0,0,1,0,0,0,1);function Hp(n,e){function t(m,p){m.matrixAutoUpdate===!0&&m.updateMatrix(),p.value.copy(m.matrix)}function i(m,p){p.color.getRGB(m.fogColor.value,rl(n)),p.isFog?(m.fogNear.value=p.near,m.fogFar.value=p.far):p.isFogExp2&&(m.fogDensity.value=p.density)}function r(m,p,E,C,S){p.isNodeMaterial?p.uniformsNeedUpdate=!1:p.isMeshBasicMaterial?o(m,p):p.isMeshLambertMaterial?(o(m,p),p.envMap&&(m.envMapIntensity.value=p.envMapIntensity)):p.isMeshToonMaterial?(o(m,p),h(m,p)):p.isMeshPhongMaterial?(o(m,p),f(m,p),p.envMap&&(m.envMapIntensity.value=p.envMapIntensity)):p.isMeshStandardMaterial?(o(m,p),u(m,p),p.isMeshPhysicalMaterial&&d(m,p,S)):p.isMeshMatcapMaterial?(o(m,p),_(m,p)):p.isMeshDepthMaterial?o(m,p):p.isMeshDistanceMaterial?(o(m,p),v(m,p)):p.isMeshNormalMaterial?o(m,p):p.isLineBasicMaterial?(s(m,p),p.isLineDashedMaterial&&a(m,p)):p.isPointsMaterial?c(m,p,E,C):p.isSpriteMaterial?l(m,p):p.isShadowMaterial?(m.color.value.copy(p.color),m.opacity.value=p.opacity):p.isShaderMaterial&&(p.uniformsNeedUpdate=!1)}function o(m,p){m.opacity.value=p.opacity,p.color&&m.diffuse.value.copy(p.color),p.emissive&&m.emissive.value.copy(p.emissive).multiplyScalar(p.emissiveIntensity),p.map&&(m.map.value=p.map,t(p.map,m.mapTransform)),p.alphaMap&&(m.alphaMap.value=p.alphaMap,t(p.alphaMap,m.alphaMapTransform)),p.bumpMap&&(m.bumpMap.value=p.bumpMap,t(p.bumpMap,m.bumpMapTransform),m.bumpScale.value=p.bumpScale,p.side===Rt&&(m.bumpScale.value*=-1)),p.normalMap&&(m.normalMap.value=p.normalMap,t(p.normalMap,m.normalMapTransform),m.normalScale.value.copy(p.normalScale),p.side===Rt&&m.normalScale.value.negate()),p.displacementMap&&(m.displacementMap.value=p.displacementMap,t(p.displacementMap,m.displacementMapTransform),m.displacementScale.value=p.displacementScale,m.displacementBias.value=p.displacementBias),p.emissiveMap&&(m.emissiveMap.value=p.emissiveMap,t(p.emissiveMap,m.emissiveMapTransform)),p.specularMap&&(m.specularMap.value=p.specularMap,t(p.specularMap,m.specularMapTransform)),p.alphaTest>0&&(m.alphaTest.value=p.alphaTest);let E=e.get(p),C=E.envMap,S=E.envMapRotation;C&&(m.envMap.value=C,m.envMapRotation.value.setFromMatrix4(Wg.makeRotationFromEuler(S)).transpose(),C.isCubeTexture&&C.isRenderTargetTexture===!1&&m.envMapRotation.value.premultiply(Vp),m.reflectivity.value=p.reflectivity,m.ior.value=p.ior,m.refractionRatio.value=p.refractionRatio),p.lightMap&&(m.lightMap.value=p.lightMap,m.lightMapIntensity.value=p.lightMapIntensity,t(p.lightMap,m.lightMapTransform)),p.aoMap&&(m.aoMap.value=p.aoMap,m.aoMapIntensity.value=p.aoMapIntensity,t(p.aoMap,m.aoMapTransform))}function s(m,p){m.diffuse.value.copy(p.color),m.opacity.value=p.opacity,p.map&&(m.map.value=p.map,t(p.map,m.mapTransform))}function a(m,p){m.dashSize.value=p.dashSize,m.totalSize.value=p.dashSize+p.gapSize,m.scale.value=p.scale}function c(m,p,E,C){m.diffuse.value.copy(p.color),m.opacity.value=p.opacity,m.size.value=p.size*E,m.scale.value=C*.5,p.map&&(m.map.value=p.map,t(p.map,m.uvTransform)),p.alphaMap&&(m.alphaMap.value=p.alphaMap,t(p.alphaMap,m.alphaMapTransform)),p.alphaTest>0&&(m.alphaTest.value=p.alphaTest)}function l(m,p){m.diffuse.value.copy(p.color),m.opacity.value=p.opacity,m.rotation.value=p.rotation,p.map&&(m.map.value=p.map,t(p.map,m.mapTransform)),p.alphaMap&&(m.alphaMap.value=p.alphaMap,t(p.alphaMap,m.alphaMapTransform)),p.alphaTest>0&&(m.alphaTest.value=p.alphaTest)}function f(m,p){m.specular.value.copy(p.specular),m.shininess.value=Math.max(p.shininess,1e-4)}function h(m,p){p.gradientMap&&(m.gradientMap.value=p.gradientMap)}function u(m,p){m.metalness.value=p.metalness,p.metalnessMap&&(m.metalnessMap.value=p.metalnessMap,t(p.metalnessMap,m.metalnessMapTransform)),m.roughness.value=p.roughness,p.roughnessMap&&(m.roughnessMap.value=p.roughnessMap,t(p.roughnessMap,m.roughnessMapTransform)),p.envMap&&(m.envMapIntensity.value=p.envMapIntensity)}function d(m,p,E){m.ior.value=p.ior,p.sheen>0&&(m.sheenColor.value.copy(p.sheenColor).multiplyScalar(p.sheen),m.sheenRoughness.value=p.sheenRoughness,p.sheenColorMap&&(m.sheenColorMap.value=p.sheenColorMap,t(p.sheenColorMap,m.sheenColorMapTransform)),p.sheenRoughnessMap&&(m.sheenRoughnessMap.value=p.sheenRoughnessMap,t(p.sheenRoughnessMap,m.sheenRoughnessMapTransform))),p.clearcoat>0&&(m.clearcoat.value=p.clearcoat,m.clearcoatRoughness.value=p.clearcoatRoughness,p.clearcoatMap&&(m.clearcoatMap.value=p.clearcoatMap,t(p.clearcoatMap,m.clearcoatMapTransform)),p.clearcoatRoughnessMap&&(m.clearcoatRoughnessMap.value=p.clearcoatRoughnessMap,t(p.clearcoatRoughnessMap,m.clearcoatRoughnessMapTransform)),p.clearcoatNormalMap&&(m.clearcoatNormalMap.value=p.clearcoatNormalMap,t(p.clearcoatNormalMap,m.clearcoatNormalMapTransform),m.clearcoatNormalScale.value.copy(p.clearcoatNormalScale),p.side===Rt&&m.clearcoatNormalScale.value.negate())),p.dispersion>0&&(m.dispersion.value=p.dispersion),p.retroreflectivity>0&&(m.retroreflectivity.value=p.retroreflectivity),p.iridescence>0&&(m.iridescence.value=p.iridescence,m.iridescenceIOR.value=p.iridescenceIOR,m.iridescenceThicknessMinimum.value=p.iridescenceThicknessRange[0],m.iridescenceThicknessMaximum.value=p.iridescenceThicknessRange[1],p.iridescenceMap&&(m.iridescenceMap.value=p.iridescenceMap,t(p.iridescenceMap,m.iridescenceMapTransform)),p.iridescenceThicknessMap&&(m.iridescenceThicknessMap.value=p.iridescenceThicknessMap,t(p.iridescenceThicknessMap,m.iridescenceThicknessMapTransform))),p.transmission>0&&(m.transmission.value=p.transmission,m.transmissionSamplerMap.value=E.texture,m.transmissionSamplerSize.value.set(E.width,E.height),p.transmissionMap&&(m.transmissionMap.value=p.transmissionMap,t(p.transmissionMap,m.transmissionMapTransform)),m.thickness.value=p.thickness,p.thicknessMap&&(m.thicknessMap.value=p.thicknessMap,t(p.thicknessMap,m.thicknessMapTransform)),m.attenuationDistance.value=p.attenuationDistance,m.attenuationColor.value.copy(p.attenuationColor)),p.anisotropy>0&&(m.anisotropyVector.value.set(p.anisotropy*Math.cos(p.anisotropyRotation),p.anisotropy*Math.sin(p.anisotropyRotation)),p.anisotropyMap&&(m.anisotropyMap.value=p.anisotropyMap,t(p.anisotropyMap,m.anisotropyMapTransform))),m.specularIntensity.value=p.specularIntensity,m.specularColor.value.copy(p.specularColor),p.specularColorMap&&(m.specularColorMap.value=p.specularColorMap,t(p.specularColorMap,m.specularColorMapTransform)),p.specularIntensityMap&&(m.specularIntensityMap.value=p.specularIntensityMap,t(p.specularIntensityMap,m.specularIntensityMapTransform))}function _(m,p){p.matcap&&(m.matcap.value=p.matcap)}function v(m,p){let E=e.get(p).light;m.referencePosition.value.setFromMatrixPosition(E.matrixWorld),m.nearDistance.value=E.shadow.camera.near,m.farDistance.value=E.shadow.camera.far}return{refreshFogUniforms:i,refreshMaterialUniforms:r}}function kp(n,e,t,i){let r={},o={},s=[],a=n.getParameter(n.MAX_UNIFORM_BUFFER_BINDINGS);function c(S,b){let T=b.program;i.uniformBlockBinding(S,T)}function l(S,b){let T=r[S.id];T===void 0&&(m(S),T=f(S),r[S.id]=T,S.addEventListener("dispose",E));let P=b.program;i.updateUBOMapping(S,P);let x=e.render.frame;o[S.id]!==x&&(u(S),o[S.id]=x)}function f(S){let b=h();S.__bindingPointIndex=b;let T=n.createBuffer(),P=S.__size,x=S.usage;return n.bindBuffer(n.UNIFORM_BUFFER,T),n.bufferData(n.UNIFORM_BUFFER,P,x),n.bindBuffer(n.UNIFORM_BUFFER,null),n.bindBufferBase(n.UNIFORM_BUFFER,b,T),T}function h(){for(let S=0;S<a;S++)if(s.indexOf(S)===-1)return s.push(S),S;return Qe("WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached."),0}function u(S){let b=r[S.id],T=S.uniforms,P=S.__cache;n.bindBuffer(n.UNIFORM_BUFFER,b);for(let x=0,A=T.length;x<A;x++){let D=T[x];if(Array.isArray(D))for(let G=0,z=D.length;G<z;G++)d(D[G],x,G,P);else d(D,x,0,P)}n.bindBuffer(n.UNIFORM_BUFFER,null)}function d(S,b,T,P){if(v(S,b,T,P)===!0){let x=S.__offset,A=S.value;if(Array.isArray(A)){let D=0;for(let G=0;G<A.length;G++){let z=A[G],Y=p(z);_(z,S.__data,D),typeof z!="number"&&typeof z!="boolean"&&!z.isMatrix3&&!ArrayBuffer.isView(z)&&(D+=Y.storage/Float32Array.BYTES_PER_ELEMENT)}}else _(A,S.__data,0);n.bufferSubData(n.UNIFORM_BUFFER,x,S.__data)}}function _(S,b,T){typeof S=="number"||typeof S=="boolean"?b[0]=S:S.isMatrix3?(b[0]=S.elements[0],b[1]=S.elements[1],b[2]=S.elements[2],b[3]=0,b[4]=S.elements[3],b[5]=S.elements[4],b[6]=S.elements[5],b[7]=0,b[8]=S.elements[6],b[9]=S.elements[7],b[10]=S.elements[8],b[11]=0):ArrayBuffer.isView(S)?b.set(new S.constructor(S.buffer,S.byteOffset,b.length)):S.toArray(b,T)}function v(S,b,T,P){let x=S.value,A=b+"_"+T;if(P[A]===void 0)return typeof x=="number"||typeof x=="boolean"?P[A]=x:ArrayBuffer.isView(x)?P[A]=x.slice():P[A]=x.clone(),!0;{let D=P[A];if(typeof x=="number"||typeof x=="boolean"){if(D!==x)return P[A]=x,!0}else{if(ArrayBuffer.isView(x))return!0;if(D.equals(x)===!1)return D.copy(x),!0}}return!1}function m(S){let b=S.uniforms,T=0,P=16;for(let A=0,D=b.length;A<D;A++){let G=Array.isArray(b[A])?b[A]:[b[A]];for(let z=0,Y=G.length;z<Y;z++){let N=G[z],F=Array.isArray(N.value)?N.value:[N.value];for(let te=0,$=F.length;te<$;te++){let ae=F[te],j=p(ae),re=T%P,oe=re%j.boundary,Ge=re+oe;T+=oe,Ge!==0&&P-Ge<j.storage&&(T+=P-Ge),N.__data=new Float32Array(j.storage/Float32Array.BYTES_PER_ELEMENT),N.__offset=T,T+=j.storage}}}let x=T%P;return x>0&&(T+=P-x),S.__size=T,S.__cache={},this}function p(S){let b={boundary:0,storage:0};return typeof S=="number"||typeof S=="boolean"?(b.boundary=4,b.storage=4):S.isVector2?(b.boundary=8,b.storage=8):S.isVector3||S.isColor?(b.boundary=16,b.storage=12):S.isVector4?(b.boundary=16,b.storage=16):S.isMatrix3?(b.boundary=48,b.storage=48):S.isMatrix4?(b.boundary=64,b.storage=64):S.isTexture?Re("WebGLRenderer: Texture samplers can not be part of an uniforms group."):ArrayBuffer.isView(S)?(b.boundary=16,b.storage=S.byteLength):Re("WebGLRenderer: Unsupported uniform value type.",S),b}function E(S){let b=S.target;b.removeEventListener("dispose",E);let T=s.indexOf(b.__bindingPointIndex);s.splice(T,1),n.deleteBuffer(r[b.id]),delete r[b.id],delete o[b.id]}function C(){for(let S in r)n.deleteBuffer(r[S]);s=[],r={},o={}}return{bind:c,update:l,dispose:C}}var Xg=new Uint16Array([12469,15057,12620,14925,13266,14620,13807,14376,14323,13990,14545,13625,14713,13328,14840,12882,14931,12528,14996,12233,15039,11829,15066,11525,15080,11295,15085,10976,15082,10705,15073,10495,13880,14564,13898,14542,13977,14430,14158,14124,14393,13732,14556,13410,14702,12996,14814,12596,14891,12291,14937,11834,14957,11489,14958,11194,14943,10803,14921,10506,14893,10278,14858,9960,14484,14039,14487,14025,14499,13941,14524,13740,14574,13468,14654,13106,14743,12678,14818,12344,14867,11893,14889,11509,14893,11180,14881,10751,14852,10428,14812,10128,14765,9754,14712,9466,14764,13480,14764,13475,14766,13440,14766,13347,14769,13070,14786,12713,14816,12387,14844,11957,14860,11549,14868,11215,14855,10751,14825,10403,14782,10044,14729,9651,14666,9352,14599,9029,14967,12835,14966,12831,14963,12804,14954,12723,14936,12564,14917,12347,14900,11958,14886,11569,14878,11247,14859,10765,14828,10401,14784,10011,14727,9600,14660,9289,14586,8893,14508,8533,15111,12234,15110,12234,15104,12216,15092,12156,15067,12010,15028,11776,14981,11500,14942,11205,14902,10752,14861,10393,14812,9991,14752,9570,14682,9252,14603,8808,14519,8445,14431,8145,15209,11449,15208,11451,15202,11451,15190,11438,15163,11384,15117,11274,15055,10979,14994,10648,14932,10343,14871,9936,14803,9532,14729,9218,14645,8742,14556,8381,14461,8020,14365,7603,15273,10603,15272,10607,15267,10619,15256,10631,15231,10614,15182,10535,15118,10389,15042,10167,14963,9787,14883,9447,14800,9115,14710,8665,14615,8318,14514,7911,14411,7507,14279,7198,15314,9675,15313,9683,15309,9712,15298,9759,15277,9797,15229,9773,15166,9668,15084,9487,14995,9274,14898,8910,14800,8539,14697,8234,14590,7790,14479,7409,14367,7067,14178,6621,15337,8619,15337,8631,15333,8677,15325,8769,15305,8871,15264,8940,15202,8909,15119,8775,15022,8565,14916,8328,14804,8009,14688,7614,14569,7287,14448,6888,14321,6483,14088,6171,15350,7402,15350,7419,15347,7480,15340,7613,15322,7804,15287,7973,15229,8057,15148,8012,15046,7846,14933,7611,14810,7357,14682,7069,14552,6656,14421,6316,14251,5948,14007,5528,15356,5942,15356,5977,15353,6119,15348,6294,15332,6551,15302,6824,15249,7044,15171,7122,15070,7050,14949,6861,14818,6611,14679,6349,14538,6067,14398,5651,14189,5311,13935,4958,15359,4123,15359,4153,15356,4296,15353,4646,15338,5160,15311,5508,15263,5829,15188,6042,15088,6094,14966,6001,14826,5796,14678,5543,14527,5287,14377,4985,14133,4586,13869,4257,15360,1563,15360,1642,15358,2076,15354,2636,15341,3350,15317,4019,15273,4429,15203,4732,15105,4911,14981,4932,14836,4818,14679,4621,14517,4386,14359,4156,14083,3795,13808,3437,15360,122,15360,137,15358,285,15355,636,15344,1274,15322,2177,15281,2765,15215,3223,15120,3451,14995,3569,14846,3567,14681,3466,14511,3305,14344,3121,14037,2800,13753,2467,15360,0,15360,1,15359,21,15355,89,15346,253,15325,479,15287,796,15225,1148,15133,1492,15008,1749,14856,1882,14685,1886,14506,1783,14324,1608,13996,1398,13702,1183]),bn=null;function Wp(){return bn===null&&(bn=new Eo(Xg,16,16,zi,jt),bn.name="DFG_LUT",bn.minFilter=Bt,bn.magFilter=Bt,bn.wrapS=di,bn.wrapT=di,bn.generateMipmaps=!1,bn.needsUpdate=!0),bn}var Js=class{constructor(e={}){let{canvas:t=Af(),context:i=null,depth:r=!0,stencil:o=!1,alpha:s=!1,antialias:a=!1,premultipliedAlpha:c=!0,preserveDrawingBuffer:l=!1,powerPreference:f="default",failIfMajorPerformanceCaveat:h=!1,reversedDepthBuffer:u=!1,outputBufferType:d=Qt}=e;this.isWebGLRenderer=!0;let _;if(i!==null){if(typeof WebGLRenderingContext<"u"&&i instanceof WebGLRenderingContext)throw new Error("THREE.WebGLRenderer: WebGL 1 is not supported since r163.");_=i.getContextAttributes().alpha}else _=s;let v=d,m=new Set([$r,Jr,Kr]),p=new Set([Qt,pi,Cn,Mr,qr,Yr]),E=new Uint32Array(4),C=new Int32Array(4),S=new L,b=null,T=null,P=[],x=[],A=null;this.domElement=t,this.debug={checkShaderErrors:!0,diagnostics:{keywords:!1},onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this.toneMapping=Ri,this.toneMappingExposure=1,this.transmissionResolutionScale=1;let D=this,G=!1,z=null,Y=null,N=null,F=null;this._outputColorSpace=ei;let te=0,$=0,ae=null,j=-1,re=null,oe=new At,Ge=new At,Oe=null,Dt=new Ee(0),at=0,ct=t.width,xt=t.height,ye=1,pt=null,Gt=null,Ie=new At(0,0,ct,xt),Et=new At(0,0,ct,xt),ci=!1,si=new rr,zt=!1,bi=!1,Di=new Ze,Yt=new L,Wt=new At,fi={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0},Xt=!1;function Ht(){return ae===null?ye:1}let B=i;function ui(M,U){return t.getContext(M,U)}let vt,w,g,H,q,Z,ue,ge,Q,ie,pe,Fe,_e,de,Ue,ze,ke,O,me,ee,he,Se,se;try{let M={alpha:!0,depth:r,stencil:o,antialias:a,premultipliedAlpha:c,preserveDrawingBuffer:l,powerPreference:f,failIfMajorPerformanceCaveat:h};if("setAttribute"in t&&t.setAttribute("data-engine",`three.js r${Wo}`),t.addEventListener("webglcontextlost",ot,!1),t.addEventListener("webglcontextrestored",tt,!1),t.addEventListener("webglcontextcreationerror",Ii,!1),B===null){let U="webgl2";if(B=ui(U,M),B===null)throw ui(U)?new Error("THREE.WebGLRenderer: Error creating WebGL context with your selected attributes."):new Error("THREE.WebGLRenderer: Error creating WebGL context.")}Ce()}catch(M){throw t.removeEventListener("webglcontextlost",ot,!1),t.removeEventListener("webglcontextrestored",tt,!1),t.removeEventListener("webglcontextcreationerror",Ii,!1),Qe("WebGLRenderer: "+M.message),M}function Ce(){vt=new ip(B),vt.init(),he=new zp(B,vt),w=new Kd(B,vt,e,he),g=new Bp(B,vt),w.reversedDepthBuffer&&u&&g.buffers.depth.setReversed(!0),Y=B.createFramebuffer(),N=B.createFramebuffer(),F=B.createFramebuffer(),H=new op(B),q=new wp,Z=new Gp(B,vt,g,q,w,he,H),ue=new tp(D),ge=new fu(B),Se=new Yd(B,ge),Q=new np(B,ge,H,Se),ie=new ap(B,Q,ge,Se,H),O=new sp(B,w,Z),Ue=new Jd(q),pe=new Ap(D,ue,vt,w,Se,Ue),Fe=new Hp(D,q),_e=new Pp,de=new Ip(vt),ke=new qd(D,ue,g,ie,_,c),ze=new Op(D,ie,w),se=new kp(B,H,w,g),me=new Zd(B,vt,H),ee=new rp(B,vt,H),H.programs=pe.programs,D.capabilities=w,D.extensions=vt,D.properties=q,D.renderLists=_e,D.shadowMap=ze,D.state=g,D.info=H}v!==Qt&&(A=new lp(v,t.width,t.height,a,r,o));let Le=new xl(D,B);this.xr=Le,this.getContext=function(){return B},this.getContextAttributes=function(){return B.getContextAttributes()},this.forceContextLoss=function(){let M=vt.get("WEBGL_lose_context");M&&M.loseContext()},this.forceContextRestore=function(){let M=vt.get("WEBGL_lose_context");M&&M.restoreContext()},this.getPixelRatio=function(){return ye},this.setPixelRatio=function(M){M!==void 0&&(ye=M,this.setSize(ct,xt,!1))},this.getSize=function(M){return M.set(ct,xt)},this.setSize=function(M,U,k=!0){if(Le.isPresenting){Re("WebGLRenderer: Can't change size while VR device is presenting.");return}ct=M,xt=U,t.width=Math.floor(M*ye),t.height=Math.floor(U*ye),k===!0&&(t.style.width=M+"px",t.style.height=U+"px"),A!==null&&A.setSize(t.width,t.height),this.setViewport(0,0,M,U)},this.getDrawingBufferSize=function(M){return M.set(ct*ye,xt*ye).floor()},this.setDrawingBufferSize=function(M,U,k){ct=M,xt=U,ye=k,t.width=Math.floor(M*k),t.height=Math.floor(U*k),this.setViewport(0,0,M,U)},this.setEffects=function(M){if(v===Qt){Qe("WebGLRenderer: setEffects() requires outputBufferType set to HalfFloatType or FloatType.");return}if(M){for(let U=0;U<M.length;U++)if(M[U].isOutputPass===!0){Re("WebGLRenderer: OutputPass is not needed in setEffects(). Tone mapping and color space conversion are applied automatically.");break}}A.setEffects(M||[])},this.getCurrentViewport=function(M){return M.copy(oe)},this.getViewport=function(M){return M.copy(Ie)},this.setViewport=function(M,U,k,W){M.isVector4?Ie.set(M.x,M.y,M.z,M.w):Ie.set(M,U,k,W),g.viewport(oe.copy(Ie).multiplyScalar(ye).round())},this.getScissor=function(M){return M.copy(Et)},this.setScissor=function(M,U,k,W){M.isVector4?Et.set(M.x,M.y,M.z,M.w):Et.set(M,U,k,W),g.scissor(Ge.copy(Et).multiplyScalar(ye).round())},this.getScissorTest=function(){return ci},this.setScissorTest=function(M){g.setScissorTest(ci=M)},this.setOpaqueSort=function(M){pt=M},this.setTransparentSort=function(M){Gt=M},this.getClearColor=function(M){return M.copy(ke.getClearColor())},this.setClearColor=function(){ke.setClearColor(...arguments)},this.getClearAlpha=function(){return ke.getClearAlpha()},this.setClearAlpha=function(){ke.setClearAlpha(...arguments)},this.clear=function(M=!0,U=!0,k=!0){let W=0;if(M){let X=!1;if(ae!==null){let xe=ae.texture.format;X=m.has(xe)}if(X){let xe=ae.texture.type,Me=p.has(xe),ce=ke.getClearColor(),Te=ke.getClearAlpha(),we=ce.r,Ve=ce.g,je=ce.b;Me?(E[0]=we,E[1]=Ve,E[2]=je,E[3]=Te,B.clearBufferuiv(B.COLOR,0,E)):(C[0]=we,C[1]=Ve,C[2]=je,C[3]=Te,B.clearBufferiv(B.COLOR,0,C))}else W|=B.COLOR_BUFFER_BIT}U&&(W|=B.DEPTH_BUFFER_BIT,this.state.buffers.depth.setMask(!0)),k&&(W|=B.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),W!==0&&B.clear(W)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.setNodesHandler=function(M){M.setRenderer(this),z=M},this.dispose=function(){t.removeEventListener("webglcontextlost",ot,!1),t.removeEventListener("webglcontextrestored",tt,!1),t.removeEventListener("webglcontextcreationerror",Ii,!1),ke.dispose(),_e.dispose(),de.dispose(),q.dispose(),ue.dispose(),ie.dispose(),Se.dispose(),se.dispose(),pe.dispose(),Le.dispose(),Le.removeEventListener("sessionstart",wl),Le.removeEventListener("sessionend",dr),un.stop()};function ot(M){M.preventDefault(),Fl("WebGLRenderer: Context Lost."),G=!0}function tt(){Fl("WebGLRenderer: Context Restored."),G=!1;let M=H.autoReset,U=ze.enabled,k=ze.autoUpdate,W=ze.needsUpdate,X=ze.type;Ce(),H.autoReset=M,ze.enabled=U,ze.autoUpdate=k,ze.needsUpdate=W,ze.type=X}function Ii(M){Qe("WebGLRenderer: A WebGL context could not be created. Reason: ",M.statusMessage)}function Ti(M){let U=M.target;U.removeEventListener("dispose",Ti),Vn(U)}function Vn(M){zo(M),q.remove(M)}function zo(M){let U=q.get(M).programs;U!==void 0&&(U.forEach(function(k){pe.releaseProgram(k)}),M.isShaderMaterial&&pe.releaseShaderCache(M))}this.renderBufferDirect=function(M,U,k,W,X,xe){U===null&&(U=fi);let Me=X.isMesh&&X.matrixWorld.determinantAffine()<0,ce=oa(M,U,k,W,X);g.setMaterial(W,Me);let Te=k.index,we=1;if(W.wireframe===!0){if(Te=Q.getWireframeAttribute(k),Te===void 0)return;we=2}let Ve=k.drawRange,je=k.attributes.position,Pe=Ve.start*we,ht=(Ve.start+Ve.count)*we;xe!==null&&(Pe=Math.max(Pe,xe.start*we),ht=Math.min(ht,(xe.start+xe.count)*we)),Te!==null?(Pe=Math.max(Pe,0),ht=Math.min(ht,Te.count)):je!=null&&(Pe=Math.max(Pe,0),ht=Math.min(ht,je.count));let Nt=ht-Pe;if(Nt<0||Nt===1/0)return;Se.setup(X,W,ce,k,Te);let bt,St=me;if(Te!==null&&(bt=ge.get(Te),St=ee,St.setIndex(bt)),X.isMesh)W.wireframe===!0?(g.setLineWidth(W.wireframeLinewidth*Ht()),St.setMode(B.LINES)):St.setMode(B.TRIANGLES);else if(X.isLine){let Zt=W.linewidth;Zt===void 0&&(Zt=1),g.setLineWidth(Zt*Ht()),X.isLineSegments?St.setMode(B.LINES):X.isLineLoop?St.setMode(B.LINE_LOOP):St.setMode(B.LINE_STRIP)}else X.isPoints?St.setMode(B.POINTS):X.isSprite&&St.setMode(B.TRIANGLES);if(X.isBatchedMesh)if(vt.get("WEBGL_multi_draw"))St.renderMultiDraw(X._multiDrawStarts,X._multiDrawCounts,X._multiDrawCount);else{let Zt=X._multiDrawStarts,be=X._multiDrawCounts,ai=X._multiDrawCount,it=Te?ge.get(Te).bytesPerElement:1,li=q.get(W).currentProgram.getUniforms();for(let Wi=0;Wi<ai;Wi++)li.setValue(B,"_gl_DrawID",Wi),St.render(Zt[Wi]/it,be[Wi])}else if(X.isInstancedMesh)St.renderInstances(Pe,Nt,X.count);else if(k.isInstancedBufferGeometry){let Zt=k._maxInstanceCount!==void 0?k._maxInstanceCount:1/0,be=Math.min(k.instanceCount,Zt);St.renderInstances(Pe,Nt,be)}else St.render(Pe,Nt)};function na(M,U,k,W){z!==null&&M.isNodeMaterial&&z.setObject(W,M),zt===!0&&Ue.setState(M,k,!1),M.transparent===!0&&M.side===wi&&M.forceSinglePass===!1?(M.side=Rt,M.needsUpdate=!0,kn(M,U,W),M.side=Xi,M.needsUpdate=!0,kn(M,U,W),M.side=wi):kn(M,U,W)}this.compile=function(M,U,k=null){k===null&&(k=M),z!==null&&z.renderStart(M,U,k),T=de.get(k),T.init(U),x.push(T),k.traverseVisible(function(X){X.isLight&&X.layers.test(U.layers)&&(T.pushLight(X),X.castShadow&&T.pushShadow(X))}),M!==k&&M.traverseVisible(function(X){X.isLight&&X.layers.test(U.layers)&&(T.pushLight(X),X.castShadow&&T.pushShadow(X))}),T.setupLights(),z!==null&&z.updateLights(T.state.lightsArray),bi=this.localClippingEnabled,zt=Ue.init(this.clippingPlanes,bi),zt===!0&&Ue.setGlobalState(this.clippingPlanes,U),z!==null&&ze.render(T.state.shadowsArray,k,U);let W=new Set;return M.traverse(function(X){if(!(X.isMesh||X.isPoints||X.isLine||X.isSprite))return;let xe=X.material;if(xe)if(Array.isArray(xe))for(let Me=0;Me<xe.length;Me++){let ce=xe[Me];na(ce,k,U,X),W.add(ce)}else na(xe,k,U,X),W.add(xe)}),T=x.pop(),z!==null&&z.renderEnd(),W},this.compileAsync=function(M,U,k=null){let W=this.compile(M,U,k);return new Promise(X=>{function xe(){if(W.forEach(function(Me){let Te=q.get(Me).currentProgram;(Te===void 0||Te.isReady())&&W.delete(Me)}),W.size===0){X(M);return}setTimeout(xe,10)}vt.get("KHR_parallel_shader_compile")!==null?xe():setTimeout(xe,10)})};let Vo=null;function Or(M){Vo&&Vo(M)}function wl(){un.stop()}function dr(){un.start()}let un=new cu;un.setAnimationLoop(Or),typeof self<"u"&&un.setContext(self),this.setAnimationLoop=function(M){Vo=M,Le.setAnimationLoop(M),M===null?un.stop():un.start()},Le.addEventListener("sessionstart",wl),Le.addEventListener("sessionend",dr),this.render=function(M,U){if(U!==void 0&&U.isCamera!==!0){Qe("WebGLRenderer.render: camera is not an instance of THREE.Camera.");return}if(G===!0)return;z!==null&&z.renderStart(M,U);let k=Le.enabled===!0&&Le.isPresenting===!0,W=A!==null&&(ae===null||k)&&A.begin(D,ae);if(M.matrixWorldAutoUpdate===!0&&M.updateMatrixWorld(),U.parent===null&&U.matrixWorldAutoUpdate===!0&&U.updateMatrixWorld(),Le.enabled===!0&&Le.isPresenting===!0&&(A===null||A.isCompositing()===!1)&&(Le.cameraAutoUpdate===!0&&Le.updateCamera(U),U=Le.getCamera()),M.isScene===!0&&M.onBeforeRender(D,M,U,ae),T=de.get(M,x.length),T.init(U),T.state.textureUnits=Z.getTextureUnits(),x.push(T),Di.multiplyMatrices(U.projectionMatrix,U.matrixWorldInverse),si.setFromProjectionMatrix(Di,Pi,U.reversedDepth),bi=this.localClippingEnabled,zt=Ue.init(this.clippingPlanes,bi),b=_e.get(M,P.length),b.init(),P.push(b),Le.enabled===!0&&Le.isPresenting===!0){let Me=D.xr.getDepthSensingMesh();Me!==null&&en(Me,U,-1/0,D.sortObjects)}en(M,U,0,D.sortObjects),b.finish(),z!==null&&z.updateLights(T.state.lightsArray),D.sortObjects===!0&&b.sort(pt,Gt),Xt=Le.enabled===!1||Le.isPresenting===!1||Le.hasDepthSensing()===!1,Xt&&ke.addToRenderList(b,M),this.info.render.frame++,this.info.autoReset===!0&&this.info.reset(),zt===!0&&Ue.beginShadows();let X=T.state.shadowsArray;if(ze.render(X,M,U),zt===!0&&Ue.endShadows(),(W&&A.hasRenderPass())===!1){let Me=b.opaque,ce=b.transmissive;if(T.setupLights(),U.isArrayCamera){let Te=U.cameras;if(ce.length>0)for(let we=0,Ve=Te.length;we<Ve;we++){let je=Te[we];Hn(Me,ce,M,je)}Xt&&ke.render(M);for(let we=0,Ve=Te.length;we<Ve;we++){let je=Te[we];Ho(b,M,je,je.viewport)}}else ce.length>0&&Hn(Me,ce,M,U),Xt&&ke.render(M),Ho(b,M,U)}ae!==null&&$===0&&(Z.updateMultisampleRenderTarget(ae),Z.updateRenderTargetMipmap(ae)),W&&A.end(D),M.isScene===!0&&M.onAfterRender(D,M,U),Se.resetDefaultState(),j=-1,re=null,x.pop(),x.length>0?(T=x[x.length-1],Z.setTextureUnits(T.state.textureUnits),zt===!0&&Ue.setGlobalState(D.clippingPlanes,T.state.camera)):T=null,P.pop(),P.length>0?b=P[P.length-1]:b=null,z!==null&&z.renderEnd()};function en(M,U,k,W){if(M.visible===!1)return;if(M.layers.test(U.layers)){if(M.isGroup)k=M.renderOrder;else if(M.isLOD)M.autoUpdate===!0&&M.update(U);else if(M.isLightProbeGrid)T.pushLightProbeGrid(M);else if(M.isLight)T.pushLight(M),M.castShadow&&T.pushShadow(M);else if(M.isSprite){if(!M.frustumCulled||M.intersectsFrustum(si)){W&&Wt.setFromMatrixPosition(M.matrixWorld).applyMatrix4(Di);let Me=ie.update(M),ce=M.material;ce.visible&&b.push(M,Me,ce,k,Wt.z,null,U)}}else if((M.isMesh||M.isLine||M.isPoints)&&(!M.frustumCulled||M.intersectsFrustum(si))){let Me=ie.update(M),ce=M.material;if(W&&(M.boundingSphere!==void 0?(M.boundingSphere===null&&M.computeBoundingSphere(),Wt.copy(M.boundingSphere.center)):(Me.boundingSphere===null&&Me.computeBoundingSphere(),Wt.copy(Me.boundingSphere.center)),Wt.applyMatrix4(M.matrixWorld).applyMatrix4(Di)),Array.isArray(ce)){let Te=Me.groups;for(let we=0,Ve=Te.length;we<Ve;we++){let je=Te[we],Pe=ce[je.materialIndex];Pe&&Pe.visible&&b.push(M,Me,Pe,k,Wt.z,je,U)}}else ce.visible&&b.push(M,Me,ce,k,Wt.z,null,U)}}let xe=M.children;for(let Me=0,ce=xe.length;Me<ce;Me++)en(xe[Me],U,k,W)}function Ho(M,U,k,W){let{opaque:X,transmissive:xe,transparent:Me}=M;T.setupLightsView(k),zt===!0&&Ue.setGlobalState(D.clippingPlanes,k),W&&g.viewport(oe.copy(W)),X.length>0&&tn(X,U,k),xe.length>0&&tn(xe,U,k),Me.length>0&&tn(Me,U,k),g.buffers.depth.setTest(!0),g.buffers.depth.setMask(!0),g.buffers.color.setMask(!0),g.setPolygonOffset(!1)}function Hn(M,U,k,W){if((k.isScene===!0?k.overrideMaterial:null)!==null)return;if(T.state.transmissionRenderTarget[W.id]===void 0){let Pe=vt.has("EXT_color_buffer_half_float")||vt.has("EXT_color_buffer_float");T.state.transmissionRenderTarget[W.id]=new _i(1,1,{generateMipmaps:!0,type:Pe?jt:Qt,minFilter:rn,samples:Math.max(4,w.samples),stencilBuffer:o,resolveDepthBuffer:!1,resolveStencilBuffer:!1,storeMultisampledDepthBuffer:!1,storeMultisampledStencilBuffer:!1,colorSpace:Ye.workingColorSpace})}let xe=T.state.transmissionRenderTarget[W.id],Me=W.viewport||oe;xe.setSize(Me.z*D.transmissionResolutionScale,Me.w*D.transmissionResolutionScale);let ce=D.getRenderTarget(),Te=D.getActiveCubeFace(),we=D.getActiveMipmapLevel();D.setRenderTarget(xe),D.getClearColor(Dt),at=D.getClearAlpha(),at<1&&D.setClearColor(16777215,.5),D.clear(),Xt&&ke.render(k);let Ve=D.toneMapping;D.toneMapping=Ri;let je=W.viewport;if(W.viewport!==void 0&&(W.viewport=void 0),T.setupLightsView(W),zt===!0&&Ue.setGlobalState(D.clippingPlanes,W),tn(M,k,W),Z.updateMultisampleRenderTarget(xe),Z.updateRenderTargetMipmap(xe),vt.has("WEBGL_multisampled_render_to_texture")===!1){let Pe=!1;for(let ht=0,Nt=U.length;ht<Nt;ht++){let bt=U[ht],{object:St,geometry:Zt,material:be,group:ai}=bt;if(be.side===wi&&St.layers.test(W.layers)){let it=be.side;be.side=Rt,be.needsUpdate=!0,Br(St,k,W,Zt,be,ai),be.side=it,be.needsUpdate=!0,Pe=!0}}Pe===!0&&(Z.updateMultisampleRenderTarget(xe),Z.updateRenderTargetMipmap(xe))}D.setRenderTarget(ce,Te,we),D.setClearColor(Dt,at),je!==void 0&&(W.viewport=je),D.toneMapping=Ve}function tn(M,U,k){let W=U.isScene===!0?U.overrideMaterial:null;for(let X=0,xe=M.length;X<xe;X++){let Me=M[X],{object:ce,geometry:Te,group:we}=Me,Ve=Me.material;Ve.allowOverride===!0&&W!==null&&(Ve=W),ce.layers.test(k.layers)&&Br(ce,U,k,Te,Ve,we)}}function Br(M,U,k,W,X,xe){z!==null&&X.isNodeMaterial&&z.setObject(M,X),M.onBeforeRender(D,U,k,W,X,xe),M.modelViewMatrix.multiplyMatrices(k.matrixWorldInverse,M.matrixWorld),M.normalMatrix.getNormalMatrix(M.modelViewMatrix),X.onBeforeRender(D,U,k,W,M,xe),X.transparent===!0&&X.side===wi&&X.forceSinglePass===!1?(X.side=Rt,X.needsUpdate=!0,D.renderBufferDirect(k,U,W,X,M,xe),X.side=Xi,X.needsUpdate=!0,D.renderBufferDirect(k,U,W,X,M,xe),X.side=wi):D.renderBufferDirect(k,U,W,X,M,xe),M.onAfterRender(D,U,k,W,X,xe)}function kn(M,U,k){U.isScene!==!0&&(U=fi);let W=q.get(M),X=T.state.lights,xe=T.state.shadowsArray,Me=X.state.version,ce=pe.getParameters(M,X.state,xe,U,k,T.state.lightProbeGridArray),Te=pe.getProgramCacheKey(ce),we=W.programs;W.environment=M.isMeshStandardMaterial||M.isMeshLambertMaterial||M.isMeshPhongMaterial?U.environment:null,W.fog=U.fog;let Ve=M.isMeshStandardMaterial||M.isMeshLambertMaterial&&!M.envMap||M.isMeshPhongMaterial&&!M.envMap;W.envMap=ue.get(M.envMap||W.environment,Ve),W.envMapRotation=W.environment!==null&&M.envMap===null?U.environmentRotation:M.envMapRotation,we===void 0&&(M.addEventListener("dispose",Ti),we=new Map,W.programs=we);let je=we.get(Te);if(je!==void 0){if(W.currentProgram===je&&W.lightsStateVersion===Me)return ko(M,ce),je}else ce.uniforms=pe.getUniforms(M),z!==null&&M.isNodeMaterial&&z.build(M,k,ce),M.onBeforeCompile(ce,D),je=pe.acquireProgram(ce,Te),we.set(Te,je),W.uniforms=ce.uniforms;let Pe=W.uniforms;return(!M.isShaderMaterial&&!M.isRawShaderMaterial||M.clipping===!0)&&(Pe.clippingPlanes=Ue.uniform),ko(M,ce),W.needsLights=pr(M),W.lightsStateVersion=Me,W.needsLights&&(Pe.ambientLightColor.value=X.state.ambient,Pe.lightProbe.value=X.state.probe,Pe.sunLights.value=X.state.sun,Pe.sunLightShadows.value=X.state.sunShadow,Pe.directionalLights.value=X.state.directional,Pe.directionalLightShadows.value=X.state.directionalShadow,Pe.spotLights.value=X.state.spot,Pe.spotLightShadows.value=X.state.spotShadow,Pe.rectAreaLights.value=X.state.rectArea,Pe.ltc_1.value=X.state.rectAreaLTC1,Pe.ltc_2.value=X.state.rectAreaLTC2,Pe.pointLights.value=X.state.point,Pe.pointLightShadows.value=X.state.pointShadow,Pe.hemisphereLights.value=X.state.hemi,Pe.sunShadowMatrix.value=X.state.sunShadowMatrix,Pe.sunShadowCascade.value=X.state.sunShadowCascade,Pe.directionalShadowMatrix.value=X.state.directionalShadowMatrix,Pe.spotLightMatrix.value=X.state.spotLightMatrix,Pe.spotLightMap.value=X.state.spotLightMap,Pe.pointShadowMatrix.value=X.state.pointShadowMatrix),W.lightProbeGrid=T.state.lightProbeGridArray.length>0,W.currentProgram=je,W.uniformsList=null,je}function Gr(M){if(M.uniformsList===null){let U=M.currentProgram.getUniforms();M.uniformsList=cr.seqWithValue(U.seq,M.uniforms)}return M.uniformsList}function ko(M,U){let k=q.get(M);k.outputColorSpace=U.outputColorSpace,k.batching=U.batching,k.batchingColor=U.batchingColor,k.instancing=U.instancing,k.instancingColor=U.instancingColor,k.instancingMorph=U.instancingMorph,k.skinning=U.skinning,k.morphTargets=U.morphTargets,k.morphNormals=U.morphNormals,k.morphColors=U.morphColors,k.morphTargetsCount=U.morphTargetsCount,k.numClippingPlanes=U.numClippingPlanes,k.numIntersection=U.numClipIntersection,k.vertexAlphas=U.vertexAlphas,k.vertexTangents=U.vertexTangents,k.toneMapping=U.toneMapping}function ra(M,U){if(M.length===0)return null;if(M.length===1)return M[0].texture!==null?M[0]:null;S.setFromMatrixPosition(U.matrixWorld);for(let k=0,W=M.length;k<W;k++){let X=M[k];if(X.texture!==null&&X.boundingBox.containsPoint(S))return X}return null}function oa(M,U,k,W,X){U.isScene!==!0&&(U=fi),Z.resetTextureUnits();let xe=U.fog,Me=W.isMeshStandardMaterial||W.isMeshLambertMaterial||W.isMeshPhongMaterial?U.environment:null,ce=ae===null?D.outputColorSpace:ae.isXRRenderTarget===!0?ae.texture.colorSpace:Ye.workingColorSpace,Te=W.isMeshStandardMaterial||W.isMeshLambertMaterial&&!W.envMap||W.isMeshPhongMaterial&&!W.envMap,we=ue.get(W.envMap||Me,Te),Ve=W.vertexColors===!0&&!!k.attributes.color&&k.attributes.color.itemSize===4,je=!!k.attributes.tangent&&(!!W.normalMap||W.anisotropy>0),Pe=!!k.morphAttributes.position,ht=!!k.morphAttributes.normal,Nt=!!k.morphAttributes.color,bt=Ri;W.toneMapped&&(ae===null||ae.isXRRenderTarget===!0)&&(bt=D.toneMapping);let St=k.morphAttributes.position||k.morphAttributes.normal||k.morphAttributes.color,Zt=St!==void 0?St.length:0,be=q.get(W),ai=T.state.lights;if(zt===!0&&(bi===!0||M!==re)){let Tt=M===re&&W.id===j;Ue.setState(W,M,Tt)}let it=!1;W.version===be.__version?(be.needsLights&&be.lightsStateVersion!==ai.state.version||be.outputColorSpace!==ce||X.isBatchedMesh&&be.batching===!1||!X.isBatchedMesh&&be.batching===!0||X.isBatchedMesh&&be.batchingColor===!0&&X._colorsTexture===null||X.isBatchedMesh&&be.batchingColor===!1&&X._colorsTexture!==null||X.isInstancedMesh&&be.instancing===!1||!X.isInstancedMesh&&be.instancing===!0||X.isSkinnedMesh&&be.skinning===!1||!X.isSkinnedMesh&&be.skinning===!0||X.isInstancedMesh&&be.instancingColor===!0&&X.instanceColor===null||X.isInstancedMesh&&be.instancingColor===!1&&X.instanceColor!==null||X.isInstancedMesh&&be.instancingMorph===!0&&X.morphTexture===null||X.isInstancedMesh&&be.instancingMorph===!1&&X.morphTexture!==null||be.envMap!==we||W.fog===!0&&be.fog!==xe||be.numClippingPlanes!==void 0&&(be.numClippingPlanes!==Ue.numPlanes||be.numIntersection!==Ue.numIntersection)||be.vertexAlphas!==Ve||be.vertexTangents!==je||be.morphTargets!==Pe||be.morphNormals!==ht||be.morphColors!==Nt||be.toneMapping!==bt||be.morphTargetsCount!==Zt||!!be.lightProbeGrid!=T.state.lightProbeGridArray.length>0)&&(it=!0):(it=!0,be.__version=W.version);let li=be.currentProgram;it===!0&&(li=kn(W,U,X),z&&W.isNodeMaterial&&z.onUpdateProgram(W,li,be));let Wi=!1,hn=!1,Wn=!1,ft=li.getUniforms(),Ot=be.uniforms;if(g.useProgram(li.program)&&(Wi=!0,hn=!0,Wn=!0),W.id!==j&&(j=W.id,hn=!0),be.needsLights){let Tt=ra(T.state.lightProbeGridArray,X);be.lightProbeGrid!==Tt&&(be.lightProbeGrid=Tt,hn=!0)}if(Wi||re!==M){g.buffers.depth.getReversed()&&M.reversedDepth!==!0&&(M._reversedDepth=!0,M.updateProjectionMatrix()),ft.setValue(B,"projectionMatrix",M.projectionMatrix),ft.setValue(B,"viewMatrix",M.matrixWorldInverse);let pn=ft.map.cameraPosition;pn!==void 0&&pn.setValue(B,Yt.setFromMatrixPosition(M.matrixWorld)),w.logarithmicDepthBuffer&&ft.setValue(B,"logDepthBufFC",2/(Math.log(M.far+1)/Math.LN2)),(W.isMeshPhongMaterial||W.isMeshToonMaterial||W.isMeshLambertMaterial||W.isMeshBasicMaterial||W.isMeshStandardMaterial||W.isShaderMaterial)&&ft.setValue(B,"isOrthographic",M.isOrthographicCamera===!0),re!==M&&(re=M,hn=!0,Wn=!0)}if(be.needsLights&&(ai.state.sunShadowMap.length>0&&ft.setValue(B,"sunShadowMap",ai.state.sunShadowMap,Z),ai.state.directionalShadowMap.length>0&&ft.setValue(B,"directionalShadowMap",ai.state.directionalShadowMap,Z),ai.state.spotShadowMap.length>0&&ft.setValue(B,"spotShadowMap",ai.state.spotShadowMap,Z),ai.state.pointShadowMap.length>0&&ft.setValue(B,"pointShadowMap",ai.state.pointShadowMap,Z)),X.isSkinnedMesh){ft.setOptional(B,X,"bindMatrix"),ft.setOptional(B,X,"bindMatrixInverse");let Tt=X.skeleton;Tt&&(Tt.boneTexture===null&&Tt.computeBoneTexture(),ft.setValue(B,"boneTexture",Tt.boneTexture,Z))}X.isBatchedMesh&&(ft.setOptional(B,X,"batchingTexture"),ft.setValue(B,"batchingTexture",X._matricesTexture,Z),ft.setOptional(B,X,"batchingIdTexture"),ft.setValue(B,"batchingIdTexture",X._indirectTexture,Z),ft.setOptional(B,X,"batchingColorTexture"),X._colorsTexture!==null&&ft.setValue(B,"batchingColorTexture",X._colorsTexture,Z));let dn=k.morphAttributes;if((dn.position!==void 0||dn.normal!==void 0||dn.color!==void 0)&&O.update(X,k,li),(hn||be.receiveShadow!==X.receiveShadow)&&(be.receiveShadow=X.receiveShadow,ft.setValue(B,"receiveShadow",X.receiveShadow)),(W.isMeshStandardMaterial||W.isMeshLambertMaterial||W.isMeshPhongMaterial)&&W.envMap===null&&U.environment!==null&&(Ot.envMapIntensity.value=U.environmentIntensity),Ot.dfgLUT!==void 0&&(Ot.dfgLUT.value=Wp()),hn){if(ft.setValue(B,"toneMappingExposure",D.toneMappingExposure),be.needsLights&&zr(Ot,Wn),xe&&W.fog===!0&&Fe.refreshFogUniforms(Ot,xe),Fe.refreshMaterialUniforms(Ot,W,ye,xt,T.state.transmissionRenderTarget[M.id]),be.needsLights&&be.lightProbeGrid){let Tt=be.lightProbeGrid;Ot.probesSH.value=Tt.texture,Ot.probesMin.value.copy(Tt.boundingBox.min),Ot.probesMax.value.copy(Tt.boundingBox.max),Ot.probesResolution.value.copy(Tt.resolution)}cr.upload(B,Gr(be),Ot,Z)}if(W.isShaderMaterial&&W.uniformsNeedUpdate===!0&&(cr.upload(B,Gr(be),Ot,Z),W.uniformsNeedUpdate=!1),W.isSpriteMaterial&&ft.setValue(B,"center",X.center),ft.setValue(B,"modelViewMatrix",X.modelViewMatrix),ft.setValue(B,"normalMatrix",X.normalMatrix),ft.setValue(B,"modelMatrix",X.matrixWorld),W.uniformsGroups!==void 0){let Tt=W.uniformsGroups;for(let pn=0,Xn=Tt.length;pn<Xn;pn++){let Vr=Tt[pn];se.update(Vr,li),se.bind(Vr,li)}}return li}function zr(M,U){M.ambientLightColor.needsUpdate=U,M.lightProbe.needsUpdate=U,M.sunLights.needsUpdate=U,M.sunLightShadows.needsUpdate=U,M.directionalLights.needsUpdate=U,M.directionalLightShadows.needsUpdate=U,M.pointLights.needsUpdate=U,M.pointLightShadows.needsUpdate=U,M.spotLights.needsUpdate=U,M.spotLightShadows.needsUpdate=U,M.rectAreaLights.needsUpdate=U,M.hemisphereLights.needsUpdate=U}function pr(M){return M.isMeshLambertMaterial||M.isMeshToonMaterial||M.isMeshPhongMaterial||M.isMeshStandardMaterial||M.isShadowMaterial||M.isShaderMaterial&&M.lights===!0}this.getActiveCubeFace=function(){return te},this.getActiveMipmapLevel=function(){return $},this.getRenderTarget=function(){return ae},this.setRenderTargetTextures=function(M,U,k){let W=q.get(M);W.__autoAllocateDepthBuffer=M.resolveDepthBuffer===!1,W.__autoAllocateDepthBuffer===!1&&(W.__useRenderToTexture=!1),q.get(M.texture).__webglTexture=U,q.get(M.depthTexture).__webglTexture=W.__autoAllocateDepthBuffer?void 0:k,W.__hasExternalTextures=!0},this.setRenderTargetFramebuffer=function(M,U){let k=q.get(M);k.__webglFramebuffer=U,k.__useDefaultFramebuffer=U===void 0},this.setRenderTarget=function(M,U=0,k=0){ae=M,te=U,$=k;let W=null,X=!1,xe=!1;if(M){let ce=q.get(M);if(ce.__useDefaultFramebuffer!==void 0){g.bindFramebuffer(B.FRAMEBUFFER,ce.__webglFramebuffer),oe.copy(M.viewport),Ge.copy(M.scissor),Oe=M.scissorTest,g.viewport(oe),g.scissor(Ge),g.setScissorTest(Oe),j=-1;return}else if(ce.__webglFramebuffer===void 0)Z.setupRenderTarget(M);else if(ce.__hasExternalTextures)Z.rebindTextures(M,q.get(M.texture).__webglTexture,q.get(M.depthTexture).__webglTexture);else if(M.depthBuffer){let Ve=M.depthTexture;if(ce.__boundDepthTexture!==Ve){if(Ve!==null&&q.has(Ve)&&(M.width!==Ve.image.width||M.height!==Ve.image.height))throw new Error("THREE.WebGLRenderer: Attached DepthTexture is initialized to the incorrect size.");Z.setupDepthRenderbuffer(M)}}let Te=M.texture;(Te.isData3DTexture||Te.isDataArrayTexture||Te.isCompressedArrayTexture)&&(xe=!0);let we=q.get(M).__webglFramebuffer;M.isWebGLCubeRenderTarget?(Array.isArray(we[U])?W=we[U][k]:W=we[U],X=!0):M.samples>0&&Z.useMultisampledRTT(M)===!1?W=q.get(M).__webglMultisampledFramebuffer:Array.isArray(we)?W=we[k]:W=we,oe.copy(M.viewport),Ge.copy(M.scissor),Oe=M.scissorTest}else oe.copy(Ie).multiplyScalar(ye).floor(),Ge.copy(Et).multiplyScalar(ye).floor(),Oe=ci;if(k!==0&&(W=Y),g.bindFramebuffer(B.FRAMEBUFFER,W)&&g.drawBuffers(M,W),g.viewport(oe),g.scissor(Ge),g.setScissorTest(Oe),X){let ce=q.get(M.texture);B.framebufferTexture2D(B.FRAMEBUFFER,B.COLOR_ATTACHMENT0,B.TEXTURE_CUBE_MAP_POSITIVE_X+U,ce.__webglTexture,k)}else if(xe){let ce=U;for(let Te=0;Te<M.textures.length;Te++){let we=q.get(M.textures[Te]);B.framebufferTextureLayer(B.FRAMEBUFFER,B.COLOR_ATTACHMENT0+Te,we.__webglTexture,k,ce)}}else if(M!==null&&k!==0){let ce=q.get(M.texture);B.framebufferTexture2D(B.FRAMEBUFFER,B.COLOR_ATTACHMENT0,B.TEXTURE_2D,ce.__webglTexture,k)}j=-1};function wn(M){let U=q.get(M);return(U.__readFormat!==M.format||U.__readType!==M.type)&&(U.__readFormat=M.format,U.__readType=M.type,U.__formatReadable=w.textureFormatReadable(M.format),U.__typeReadable=w.textureTypeReadable(M.type)),U}this.readRenderTargetPixels=function(M,U,k,W,X,xe,Me,ce=0){if(!(M&&M.isWebGLRenderTarget)){Qe("WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");return}let Te=q.get(M).__webglFramebuffer;if(M.isWebGLCubeRenderTarget&&Me!==void 0&&(Te=Te[Me]),Te){g.bindFramebuffer(B.FRAMEBUFFER,Te);try{let we=M.textures[ce],Ve=we.format,je=we.type;M.textures.length>1&&B.readBuffer(B.COLOR_ATTACHMENT0+ce);let Pe=wn(we);if(Pe.__formatReadable===!1){Qe("WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.");return}if(Pe.__typeReadable===!1){Qe("WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.");return}U>=0&&U<=M.width-W&&k>=0&&k<=M.height-X&&B.readPixels(U,k,W,X,he.convert(Ve),he.convert(je),xe)}finally{let we=ae!==null?q.get(ae).__webglFramebuffer:null;g.bindFramebuffer(B.FRAMEBUFFER,we)}}},this.readRenderTargetPixelsAsync=async function(M,U,k,W,X,xe,Me,ce=0){if(!(M&&M.isWebGLRenderTarget))throw new Error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");let Te=q.get(M).__webglFramebuffer;if(M.isWebGLCubeRenderTarget&&Me!==void 0&&(Te=Te[Me]),Te)if(U>=0&&U<=M.width-W&&k>=0&&k<=M.height-X){g.bindFramebuffer(B.FRAMEBUFFER,Te);let we=M.textures[ce],Ve=we.format,je=we.type;M.textures.length>1&&B.readBuffer(B.COLOR_ATTACHMENT0+ce);let Pe=wn(we);if(Pe.__formatReadable===!1)throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.");if(Pe.__typeReadable===!1)throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.");let ht=B.createBuffer();B.bindBuffer(B.PIXEL_PACK_BUFFER,ht),B.bufferData(B.PIXEL_PACK_BUFFER,xe.byteLength,B.STREAM_READ),B.readPixels(U,k,W,X,he.convert(Ve),he.convert(je),0),B.bindBuffer(B.PIXEL_PACK_BUFFER,null);let Nt=ae!==null?q.get(ae).__webglFramebuffer:null;g.bindFramebuffer(B.FRAMEBUFFER,Nt);let bt=B.fenceSync(B.SYNC_GPU_COMMANDS_COMPLETE,0);return B.flush(),await Rf(B,bt,4),B.bindBuffer(B.PIXEL_PACK_BUFFER,ht),B.getBufferSubData(B.PIXEL_PACK_BUFFER,0,xe),B.bindBuffer(B.PIXEL_PACK_BUFFER,null),B.deleteBuffer(ht),B.deleteSync(bt),xe}else throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.")},this.copyFramebufferToTexture=function(M,U=null,k=0){let W=Math.pow(2,-k),X=Math.floor(M.image.width*W),xe=Math.floor(M.image.height*W),Me=U!==null?U.x:0,ce=U!==null?U.y:0;Z.setTexture2D(M,0),B.copyTexSubImage2D(B.TEXTURE_2D,k,0,0,Me,ce,X,xe),g.unbindTexture()},this.copyTextureToTexture=function(M,U,k=null,W=null,X=0,xe=0){let Me,ce,Te,we,Ve,je,Pe,ht,Nt,bt=M.isCompressedTexture?M.mipmaps[xe]:M.image;if(k!==null)Me=k.max.x-k.min.x,ce=k.max.y-k.min.y,Te=k.isBox3?k.max.z-k.min.z:1,we=k.min.x,Ve=k.min.y,je=k.isBox3?k.min.z:0;else{let Ot=Math.pow(2,-X);Me=Math.floor(bt.width*Ot),ce=Math.floor(bt.height*Ot),M.isDataArrayTexture?Te=bt.depth:M.isData3DTexture?Te=Math.floor(bt.depth*Ot):Te=1,we=0,Ve=0,je=0}W!==null?(Pe=W.x,ht=W.y,Nt=W.z):(Pe=0,ht=0,Nt=0);let St=he.convert(U.format),Zt=he.convert(U.type),be;U.isData3DTexture?(Z.setTexture3D(U,0),be=B.TEXTURE_3D):U.isDataArrayTexture||U.isCompressedArrayTexture?(Z.setTexture2DArray(U,0),be=B.TEXTURE_2D_ARRAY):(Z.setTexture2D(U,0),be=B.TEXTURE_2D),g.activeTexture(B.TEXTURE0),g.pixelStorei(B.UNPACK_FLIP_Y_WEBGL,U.flipY),g.pixelStorei(B.UNPACK_PREMULTIPLY_ALPHA_WEBGL,U.premultiplyAlpha),g.pixelStorei(B.UNPACK_ALIGNMENT,U.unpackAlignment);let ai=g.getParameter(B.UNPACK_ROW_LENGTH),it=g.getParameter(B.UNPACK_IMAGE_HEIGHT),li=g.getParameter(B.UNPACK_SKIP_PIXELS),Wi=g.getParameter(B.UNPACK_SKIP_ROWS),hn=g.getParameter(B.UNPACK_SKIP_IMAGES);g.pixelStorei(B.UNPACK_ROW_LENGTH,bt.width),g.pixelStorei(B.UNPACK_IMAGE_HEIGHT,bt.height),g.pixelStorei(B.UNPACK_SKIP_PIXELS,we),g.pixelStorei(B.UNPACK_SKIP_ROWS,Ve),g.pixelStorei(B.UNPACK_SKIP_IMAGES,je);let Wn=M.isDataArrayTexture||M.isData3DTexture,ft=U.isDataArrayTexture||U.isData3DTexture;if(M.isDepthTexture){let Ot=q.get(M),dn=q.get(U),Tt=q.get(Ot.__renderTarget),pn=q.get(dn.__renderTarget);g.bindFramebuffer(B.READ_FRAMEBUFFER,Tt.__webglFramebuffer),g.bindFramebuffer(B.DRAW_FRAMEBUFFER,pn.__webglFramebuffer);for(let Xn=0;Xn<Te;Xn++)Wn&&(B.framebufferTextureLayer(B.READ_FRAMEBUFFER,B.COLOR_ATTACHMENT0,q.get(M).__webglTexture,X,je+Xn),B.framebufferTextureLayer(B.DRAW_FRAMEBUFFER,B.COLOR_ATTACHMENT0,q.get(U).__webglTexture,xe,Nt+Xn)),B.blitFramebuffer(we,Ve,Me,ce,Pe,ht,Me,ce,B.DEPTH_BUFFER_BIT,B.NEAREST);g.bindFramebuffer(B.READ_FRAMEBUFFER,null),g.bindFramebuffer(B.DRAW_FRAMEBUFFER,null)}else if(X!==0||M.isRenderTargetTexture||q.has(M)){let Ot=q.get(M),dn=q.get(U);g.bindFramebuffer(B.READ_FRAMEBUFFER,N),g.bindFramebuffer(B.DRAW_FRAMEBUFFER,F);for(let Tt=0;Tt<Te;Tt++)Wn?B.framebufferTextureLayer(B.READ_FRAMEBUFFER,B.COLOR_ATTACHMENT0,Ot.__webglTexture,X,je+Tt):B.framebufferTexture2D(B.READ_FRAMEBUFFER,B.COLOR_ATTACHMENT0,B.TEXTURE_2D,Ot.__webglTexture,X),ft?B.framebufferTextureLayer(B.DRAW_FRAMEBUFFER,B.COLOR_ATTACHMENT0,dn.__webglTexture,xe,Nt+Tt):B.framebufferTexture2D(B.DRAW_FRAMEBUFFER,B.COLOR_ATTACHMENT0,B.TEXTURE_2D,dn.__webglTexture,xe),X!==0?B.blitFramebuffer(we,Ve,Me,ce,Pe,ht,Me,ce,B.COLOR_BUFFER_BIT,B.NEAREST):ft?B.copyTexSubImage3D(be,xe,Pe,ht,Nt+Tt,we,Ve,Me,ce):B.copyTexSubImage2D(be,xe,Pe,ht,we,Ve,Me,ce);g.bindFramebuffer(B.READ_FRAMEBUFFER,null),g.bindFramebuffer(B.DRAW_FRAMEBUFFER,null)}else ft?M.isDataTexture||M.isData3DTexture?B.texSubImage3D(be,xe,Pe,ht,Nt,Me,ce,Te,St,Zt,bt.data):U.isCompressedArrayTexture?B.compressedTexSubImage3D(be,xe,Pe,ht,Nt,Me,ce,Te,St,bt.data):B.texSubImage3D(be,xe,Pe,ht,Nt,Me,ce,Te,St,Zt,bt):M.isDataTexture?B.texSubImage2D(B.TEXTURE_2D,xe,Pe,ht,Me,ce,St,Zt,bt.data):M.isCompressedTexture?B.compressedTexSubImage2D(B.TEXTURE_2D,xe,Pe,ht,bt.width,bt.height,St,bt.data):B.texSubImage2D(B.TEXTURE_2D,xe,Pe,ht,Me,ce,St,Zt,bt);g.pixelStorei(B.UNPACK_ROW_LENGTH,ai),g.pixelStorei(B.UNPACK_IMAGE_HEIGHT,it),g.pixelStorei(B.UNPACK_SKIP_PIXELS,li),g.pixelStorei(B.UNPACK_SKIP_ROWS,Wi),g.pixelStorei(B.UNPACK_SKIP_IMAGES,hn),xe===0&&U.generateMipmaps&&B.generateMipmap(be),g.unbindTexture()},this.initRenderTarget=function(M){q.get(M).__webglFramebuffer===void 0&&Z.setupRenderTarget(M)},this.initTexture=function(M){M.isCubeTexture?Z.setTextureCube(M,0):M.isData3DTexture?Z.setTexture3D(M,0):M.isDataArrayTexture||M.isCompressedArrayTexture?Z.setTexture2DArray(M,0):Z.setTexture2D(M,0),g.unbindTexture()},this.resetState=function(){te=0,$=0,ae=null,g.reset(),Se.reset()},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}get coordinateSystem(){return Pi}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(e){this._outputColorSpace=e;let t=this.getContext();t.drawingBufferColorSpace=Ye._getDrawingBufferColorSpace(e),t.unpackColorSpace=Ye._getUnpackColorSpace()}};var Ml=class extends Ar{constructor(){super(),this.name="RoomEnvironment",this.position.y=-3.5;let e=new vi;e.deleteAttribute("uv");let t=new Sn({side:Rt}),i=new Sn,r=new Xs(16777215,900,28,2);r.position.set(.418,16.199,.3),this.add(r);let o=new We(e,t);o.position.set(-.757,13.219,.717),o.scale.set(31.713,28.305,28.591),this.add(o);let s=new Bs(e,i,6),a=new dt;a.position.set(-10.906,2.009,1.846),a.rotation.set(0,-.195,0),a.scale.set(2.328,7.905,4.651),a.updateMatrix(),s.setMatrixAt(0,a.matrix),a.position.set(-5.607,-.754,-.758),a.rotation.set(0,.994,0),a.scale.set(1.97,1.534,3.955),a.updateMatrix(),s.setMatrixAt(1,a.matrix),a.position.set(6.167,.857,7.803),a.rotation.set(0,.561,0),a.scale.set(3.927,6.285,3.687),a.updateMatrix(),s.setMatrixAt(2,a.matrix),a.position.set(-2.017,.018,6.124),a.rotation.set(0,.333,0),a.scale.set(2.002,4.566,2.064),a.updateMatrix(),s.setMatrixAt(3,a.matrix),a.position.set(2.291,-.756,-2.621),a.rotation.set(0,-.286,0),a.scale.set(1.546,1.552,1.496),a.updateMatrix(),s.setMatrixAt(4,a.matrix),a.position.set(-2.193,-.369,-5.547),a.rotation.set(0,.516,0),a.scale.set(3.875,3.487,2.986),a.updateMatrix(),s.setMatrixAt(5,a.matrix),this.add(s);let c=new We(e,No(50));c.position.set(-16.116,14.37,8.208),c.scale.set(.1,2.428,2.739),this.add(c);let l=new We(e,No(50));l.position.set(-16.109,18.021,-8.207),l.scale.set(.1,2.425,2.751),this.add(l);let f=new We(e,No(17));f.position.set(14.904,12.198,-1.832),f.scale.set(.15,4.265,6.331),this.add(f);let h=new We(e,No(43));h.position.set(-.462,8.89,14.52),h.scale.set(4.38,5.441,.088),this.add(h);let u=new We(e,No(20));u.position.set(3.235,11.486,-12.541),u.scale.set(2.5,2,.1),this.add(u);let d=new We(e,No(100));d.position.set(0,20,0),d.scale.set(1,.1,1),this.add(d)}dispose(){let e=new Set;this.traverse(t=>{t.isMesh&&(e.add(t.geometry),e.add(t.material))});for(let t of e)t.dispose()}};function No(n){return new Hs({color:0,emissive:16777215,emissiveIntensity:n})}var $s=new L;function ji(n,e,t,i,r,o){let s=2*Math.PI*r/4,a=Math.max(o-2*r,0),c=Math.PI/4;$s.copy(e),$s[i]=0,$s.normalize();let l=.5*s/(s+a),f=1-$s.angleTo(n)/c;return Math.sign($s[t])===1?f*l:a/(s+a)+l+l*(1-f)}var vl=class n extends vi{constructor(e=1,t=1,i=1,r=2,o=.1){let s=r*2+1;if(o=Math.min(e/2,t/2,i/2,o),super(1,1,1,s,s,s),this.type="RoundedBoxGeometry",this.parameters={width:e,height:t,depth:i,segments:r,radius:o},s===1)return;let a=this.toNonIndexed();this.index=null,this.attributes.position=a.attributes.position,this.attributes.normal=a.attributes.normal,this.attributes.uv=a.attributes.uv;let c=new L,l=new L,f=new L(e,t,i).divideScalar(2).subScalar(o),h=this.attributes.position.array,u=this.attributes.normal.array,d=this.attributes.uv.array,_=h.length/6,v=new L,m=.5/s;for(let p=0,E=0;p<h.length;p+=3,E+=2)switch(c.fromArray(h,p),l.copy(c),l.x-=Math.sign(l.x)*m,l.y-=Math.sign(l.y)*m,l.z-=Math.sign(l.z)*m,l.normalize(),h[p+0]=f.x*Math.sign(c.x)+l.x*o,h[p+1]=f.y*Math.sign(c.y)+l.y*o,h[p+2]=f.z*Math.sign(c.z)+l.z*o,u[p+0]=l.x,u[p+1]=l.y,u[p+2]=l.z,Math.floor(p/_)){case 0:v.set(1,0,0),d[E+0]=ji(v,l,"z","y",o,i),d[E+1]=1-ji(v,l,"y","z",o,t);break;case 1:v.set(-1,0,0),d[E+0]=1-ji(v,l,"z","y",o,i),d[E+1]=1-ji(v,l,"y","z",o,t);break;case 2:v.set(0,1,0),d[E+0]=1-ji(v,l,"x","z",o,e),d[E+1]=ji(v,l,"z","x",o,i);break;case 3:v.set(0,-1,0),d[E+0]=1-ji(v,l,"x","z",o,e),d[E+1]=1-ji(v,l,"z","x",o,i);break;case 4:v.set(0,0,1),d[E+0]=1-ji(v,l,"x","y",o,e),d[E+1]=1-ji(v,l,"y","x",o,t);break;case 5:v.set(0,0,-1),d[E+0]=ji(v,l,"x","y",o,e),d[E+1]=1-ji(v,l,"y","x",o,t);break}}static fromJSON(e){return new n(e.width,e.height,e.depth,e.segments,e.radius)}};function qp(n,e=!1){let t=n[0].index!==null,i=new Set(Object.keys(n[0].attributes)),r=new Set(Object.keys(n[0].morphAttributes)),o={},s={},a=n[0].morphTargetsRelative,c=new Ct,l=0;for(let f=0;f<n.length;++f){let h=n[f],u=0;if(t!==(h.index!==null))return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+f+". All geometries must have compatible attributes; make sure index attribute exists among all geometries, or in none of them."),null;for(let d in h.attributes){if(!i.has(d))return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+f+'. All geometries must have compatible attributes; make sure "'+d+'" attribute exists among all geometries, or in none of them.'),null;o[d]===void 0&&(o[d]=[]),o[d].push(h.attributes[d]),u++}if(u!==i.size)return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+f+". Make sure all geometries have the same number of attributes."),null;if(a!==h.morphTargetsRelative)return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+f+". .morphTargetsRelative must be consistent throughout all geometries."),null;for(let d in h.morphAttributes){if(!r.has(d))return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+f+".  .morphAttributes must be consistent throughout all geometries."),null;s[d]===void 0&&(s[d]=[]),s[d].push(h.morphAttributes[d])}if(e){let d;if(t)d=h.index.count;else if(h.attributes.position!==void 0)d=h.attributes.position.count;else return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+f+". The geometry must have either an index or a position attribute"),null;c.addGroup(l,d,f),l+=d}}if(t){let f=0,h=[];for(let u=0;u<n.length;++u){let d=n[u].index;for(let _=0;_<d.count;++_)h.push(d.getX(_)+f);f+=n[u].attributes.position.count}c.setIndex(h)}for(let f in o){let h=Xp(o[f]);if(!h)return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the "+f+" attribute."),null;c.setAttribute(f,h)}for(let f in s){let h=s[f][0].length;if(h!==0){c.morphAttributes=c.morphAttributes||{},c.morphAttributes[f]=[];for(let u=0;u<h;++u){let d=[];for(let v=0;v<s[f].length;++v)d.push(s[f][v][u]);let _=Xp(d);if(!_)return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the "+f+" morphAttribute."),null;c.morphAttributes[f].push(_)}}}return c}function Xp(n){let e,t,i,r=-1,o=0;for(let l=0;l<n.length;++l){let f=n[l];if(e===void 0&&(e=f.array.constructor),e!==f.array.constructor)return console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.array must be of consistent array types across matching attributes."),null;if(t===void 0&&(t=f.itemSize),t!==f.itemSize)return console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.itemSize must be consistent across matching attributes."),null;if(i===void 0&&(i=f.normalized),i!==f.normalized)return console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.normalized must be consistent across matching attributes."),null;if(r===-1&&(r=f.gpuType),r!==f.gpuType)return console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.gpuType must be consistent across matching attributes."),null;o+=f.count*t}let s=new e(o),a=new Vt(s,t,i),c=0;for(let l=0;l<n.length;++l){let f=n[l];if(f.isInterleavedBufferAttribute){let h=c/t;for(let u=0,d=f.count;u<d;u++)for(let _=0;_<t;_++){let v=f.getComponent(u,_);a.setComponent(u+h,_,v)}}else s.set(f.array,c);c+=f.count*t}return r!==void 0&&(a.gpuType=r),a}var yl={};Pm(yl,{COL:()=>em,CUT:()=>Nr,EXT:()=>Oo,FURNITURE:()=>wc,H:()=>Ac,OPENINGS:()=>Tn,ROOMS:()=>ur,SCALA:()=>Tc,WALLS:()=>ea,superfici:()=>Rc});var Ac=3.8,Oo={w:12,d:9.4},Nr=1.1,ea=[[0,0,12,.55,"perimetrale"],[0,8.85,12,9.4,"perimetrale"],[0,.55,.45,8.85,"confine"],[11.55,.55,12,8.85,"confine"],[.45,4.4,11.55,4.75,"spina"],[6.2,4.75,6.32,8.85,"tramezzo"],[3.95,.55,4.07,4.4,"tramezzo"],[6.4,.55,6.52,4.4,"tramezzo"],[6.52,2.95,8.6,3.07,"tramezzo"],[8.6,.55,8.72,4.4,"tramezzo"],[9.45,4.75,9.57,6.97,"tramezzo"],[9.57,6.85,11.55,6.97,"tramezzo"]],Tn=[{wall:0,c:1.8,w:1.2,y0:.8,y1:3.3,k:"finestra"},{wall:0,c:5.2,w:1,y0:0,y1:2.5,k:"portone",hinge:0,side:1},{wall:0,c:7.4,w:.8,y0:1.3,y1:2.9,k:"finestra"},{wall:0,c:10.2,w:1.2,y0:.8,y1:3.3,k:"finestra"},{wall:1,c:1.8,w:1.2,y0:0,y1:3.3,k:"portafinestra",parapetto:!0},{wall:1,c:4.6,w:1.2,y0:0,y1:3.3,k:"portafinestra",parapetto:!0},{wall:1,c:7.4,w:1.2,y0:.8,y1:3.3,k:"finestra"},{wall:1,c:10.2,w:1.2,y0:.8,y1:3.3,k:"finestra"},{wall:4,c:5.1,w:1.4,y0:0,y1:2.7,k:"doppia",side:1},{wall:4,c:8.1,w:.9,y0:0,y1:2.4,k:"porta",hinge:1,side:1},{wall:8,c:7.56,w:.75,y0:0,y1:2.2,k:"porta",hinge:0,side:-1},{wall:6,c:2.6,w:.9,y0:0,y1:2.4,k:"porta",hinge:0,side:1},{wall:7,c:3.735,w:.8,y0:0,y1:2.4,k:"porta",hinge:1,side:1},{wall:9,c:3.735,w:.8,y0:0,y1:2.4,k:"porta",hinge:1,side:1},{wall:10,c:6.2,w:.75,y0:0,y1:2.2,k:"porta",hinge:0,side:1}],ur=[{id:"soggiorno",nome:"Soggiorno",pav:"spina",rects:[[.45,4.75,6.2,8.85]]},{id:"camera",nome:"Camera",pav:"spina",rects:[[6.32,4.75,9.45,8.85],[9.45,6.97,11.55,8.85]]},{id:"bagno2",nome:"Bagno 2",pav:"marmo",rects:[[9.57,4.75,11.55,6.85]]},{id:"cucina",nome:"Cucina",pav:"cotto",rects:[[.45,.55,3.95,4.4]]},{id:"ingresso",nome:"Ingresso",pav:"spina",rects:[[4.07,.55,6.4,4.4]]},{id:"bagno",nome:"Bagno",pav:"marmo",rects:[[6.52,.55,8.6,2.95]]},{id:"disimpegno",nome:"Disimpegno",pav:"spina",rects:[[6.52,3.07,8.6,4.4]]},{id:"cameretta",nome:"Cameretta",pav:"spina",rects:[[8.72,.55,11.55,4.4]]}],em={noce:"#5A4434",noceS:"#45352A",rovere:"#A38260",laccato:"#E9E5DD",bianco:"#F1EEE8",ceramica:"#F4F3EF",nero:"#1D1D1F",ottone:"#B08D57",acciaio:"#B8BABD",tessuto:"#8E8981",blu:"#3E4452",lino:"#E7E2D8",lino2:"#C9C0B1",tenda:"#D9D0C1",ardesia:"#56606C",tappeto:"#6E675F",tappeto2:"#8C8377",sabbia:"#B9AE9C",salvia:"#7F8A74",ocra:"#B59B6A",foglia:"#4E5C44",foglia2:"#617050",ghisa:"#E6E2DA",vaso:"#D9D4CA",travertino:"#D6CCB9",rivestimento:"#E4DCCB",zoccolo:"#3A3A3C",limone:"#D6C45E",acqua:"#BFCBD0",vetroNero:"#131315"},J=em,Ur=Math.PI/180,Ae=(n,e,t,i,r={})=>({t:"box",s:n,p:e,m:t,c:i,...r}),yt=(n,e,t,i,r=.02,o={})=>({t:"rbox",s:n,p:e,m:t,c:i,r,...o}),lt=(n,e,t,i,r,o,s={})=>({t:"cyl",s:[n,e,t],p:i,m:r,c:o,...s}),Sl=(n,e,t,i,r,o,s={})=>({t:"sfera",s:[n,e,t],p:i,m:r,c:o,...s});function qg(n){let e=Math.floor(n*9973)>>>0;return()=>(e=e*1664525+1013904223>>>0,e/4294967296)}function Gn(n,e,t,i,r,o=J.nero,s=.05,a=.014,c="metallo"){let l=[];for(let f of[-1,1])for(let h of[-1,1])l.push(lt(a,r,a,[n+f*(t/2-s),0,e+h*(i/2-s)],c,o,{q:6}));return l}function Fr(n,e,t,i,r=J.noce){let o=n-t*.2,s=e-i*.2,a=t!==0,c=8*Ur,l=a?[0,0,t>0?c:-c]:[i>0?-c:c,0,0];return[yt([.44,.045,.44],[n,.44,e],"legno",r,.018,{q:1}),yt(a?[.035,.4,.42]:[.42,.4,.035],[o-t*.02,.5,s-i*.02],"legno",r,.012,{q:1,rot:l}),...Gn(n,e,.44,.44,.44,r,.035,.013,"legno")]}function Yg(n,e,t=2.2,i=J.tessuto){let o=e+.46,s=[];s.push(yt([t,.22,.92],[n,.1,o],"tessile",i,.04,{q:1})),s.push(yt([t,.44,.2],[n,.3,e+.1],"tessile",i,.05,{q:1}));for(let l of[-1,1])s.push(yt([.18,.3,.92],[n+l*(t/2-.09),.3,o],"tessile",i,.05,{q:1}));let a=3,c=(t-.36)/a;for(let l=0;l<a;l++){let f=n-(t-.36)/2+c*(l+.5);s.push(yt([c-.015,.14,.68],[f,.32,e+.54],"tessile",i,.05,{q:2})),s.push(yt([c-.02,.4,.17],[f,.43,e+.3],"tessile",i,.06,{q:2,rot:[-10*Ur,0,0]}))}return s.push(yt([.42,.4,.12],[n-t/2+.44,.47,e+.46],"tessile",J.ocra,.05,{q:2,rot:[-14*Ur,.25,.06]})),s.push(yt([.4,.38,.12],[n+t/2-.44,.47,e+.46],"tessile",J.salvia,.05,{q:2,rot:[-12*Ur,-.3,-.05]})),s.push(...Gn(n,o,t,.92,.1,J.nero,.08,.018)),s}function Yp(n,e,t=J.blu){return[yt([.8,.22,.8],[n,.12,e],"tessile",t,.04,{q:1}),yt([.8,.46,.18],[n,.3,e+.31],"tessile",t,.05,{q:1,rot:[8*Ur,0,0]}),yt([.14,.26,.8],[n-.33,.32,e],"tessile",t,.05,{q:1}),yt([.14,.26,.8],[n+.33,.32,e],"tessile",t,.05,{q:1}),yt([.52,.13,.58],[n,.34,e-.05],"tessile",t,.05,{q:2}),...Gn(n,e,.8,.8,.12,J.noce,.06,.016,"legno")]}function Zp(n,e,t,i,r,o=J.lino2){let s=n+r*(.1+t/2),a=[];a.push(yt([.1,1.05,i+.1],[n+r*.05,.08,e],"tessile",o,.03,{q:1})),a.push(yt([t,.28,i],[s,.08,e],"tessile",o,.03,{q:1})),a.push(yt([t-.04,.2,i-.04],[s,.36,e],"tessile",J.lino,.06,{q:1})),a.push(yt([t*.64,.07,i+.03],[s+r*t*.18,.52,e],"tessile","#E2DDD2",.035,{q:1})),a.push(yt([.5,.05,i+.07],[s+r*(t/2-.34),.565,e],"tessile",J.ardesia,.02,{q:1}));let c=i>1.3?2:1,l=c===2?.66:.6;for(let f=0;f<c;f++){let h=e+(c===2?(f-.5)*.76:0);a.push(yt([.15,.5,l],[n+r*.24,.52,h],"tessile",J.lino,.06,{q:2,rot:[0,0,r*22*Ur]})),a.push(yt([.34,.11,l-.06],[n+r*.5,.56,h],"tessile","#DCD5C8",.05,{q:1}))}return a.push(...Gn(s,e,t,i,.08,J.noceS,.08,.022,"legno")),a}function fr(n,e,t,i,r,o,s,a,c=0,l={}){let f=o[0]==="z",h=o[1]==="+"?1:-1,u=[],d=l.mat||"lucido",_=(C,S,b)=>f?[C,S,b]:[b,S,C],v=(C,S,b)=>f?[n+C,S,e+b]:[n+b,S,e+C];u.push(Ae(_(t,r,i-.02),v(0,c,-h*.01),d,a));let m=s,p=t/m,E=l.cassetti;for(let C=0;C<m;C++){let S=-t/2+p*(C+.5);if(E)for(let b=0;b<E;b++){let T=(r-.02)/E,P=c+.01+b*T;u.push(Ae(_(p-.008,T-.008,.02),v(S,P+.004,h*(i/2-.01)),d,a)),u.push(Ae(_(.12,.012,.018),v(S,P+T*.5,h*(i/2+.009)),"metallo",l.maniglia||J.ottone))}else{u.push(Ae(_(p-.006,r-.012,.022),v(S,c+.006,h*(i/2-.009)),d,a));let b=m===1?1:C%2?-1:1,T=Math.min(.32,r*.3);u.push(Ae(_(.012,T,.018),v(S+b*(p/2-.05),c+(r>1.4?1.02:r-T-.06),h*(i/2+.01)),"metallo",l.maniglia||J.ottone))}}return u}function Kp(n,e,t,i){let r=i[0]==="z",o=i[1]==="+"?1:-1,s=.6,a=[],c=e-n,l=(n+e)/2,f=(_,v,m)=>r?[_,v,t+o*m]:[t+o*m,v,_],h=(_,v,m)=>r?[_,v,m]:[m,v,_];a.push(Ae(h(c,.1,s-.07),f(l,0,(s-.07)/2),"lucido",J.zoccolo)),a.push(Ae(h(c,.74,s-.03),f(l,.1,(s-.03)/2),"lucido",J.laccato));let u=Math.max(1,Math.round(c/.6)),d=c/u;for(let _=0;_<u;_++){let v=n+d*(_+.5);a.push(Ae(h(d-.006,.72,.02),f(v,.12,s-.02),"lucido",J.laccato)),a.push(Ae(h(.28,.012,.02),f(v,.77,s+.005),"metallo",J.acciaio))}return a.push(Ae(h(c+.02,.04,s+.02),f(l,.86,(s+.02)/2),"pietra",J.travertino)),a}function Jp(n,e,t,i,r=.14,o=.6){let s=[],a=Math.round((e-n)/.085),c=t+i*.07;for(let l=0;l<a;l++)s.push(Ae([.055,o,.085],[n+(l+.5)*(e-n)/a,r,c],"lucido",J.ghisa));return s.push(Ae([e-n,.03,.05],[(n+e)/2,r+.05,c],"lucido",J.ghisa)),s.push(Ae([e-n,.03,.05],[(n+e)/2,r+o-.08,c],"lucido",J.ghisa)),s}function Qs(n,e,t,i,r=3.5,o=.02){let s=[],a=t+i*.12;for(let[l,f]of[[n-.4,n+.06],[e-.06,e+.4]])s.push(Ae([f-l,r-o,.05],[(l+f)/2,o,a],"decoro",J.tenda,{uv:"pieghe"}));let c=e-n+1.1;return s.push(lt(.012,c,.012,[(n+e)/2,r+.03-c/2,a+.01*i],"metallo",J.nero,{q:8,rot:[0,0,90*Ur]})),s}function bc(n,e,t,i,r,o,s,a=J.nero){return[Ae([.03,o,r],[n+e*.015,i,t],"legno",a),Ae([.01,o-.09,r-.09],[n+e*.033,i+.045,t],"decoro","#FFFFFF",{uv:s})]}function Zg(n,e,t,i,r,o,s,a=J.nero){return[Ae([r,o,.03],[t,i,n+e*.015],"legno",a),Ae([r-.09,o-.09,.01],[t,i+.045,n+e*.033],"decoro","#FFFFFF",{uv:s})]}function $p(n,e,t=1.5,i=1){let r=qg(i),o=[lt(.17,.36,.13,[n,0,e],"lucido",J.vaso,{q:16}),lt(.012,t*.5,.016,[n,.34,e],"legno",J.noceS,{q:6})];for(let s=0;s<7;s++){let a=r()*6.283,c=.06+r()*.16,l=.62+s/6*(t-.8),f=.17+r()*.1;o.push(Sl(f,f*.8,f,[n+Math.cos(a)*c,l,e+Math.sin(a)*c],"tessile",s%2?J.foglia:J.foglia2,{q:1}))}return o}function Kg(n,e){return[lt(.14,.02,.14,[n,0,e],"metallo",J.nero,{q:16}),lt(.011,1.46,.011,[n,.02,e],"metallo",J.ottone,{q:8}),lt(.15,.28,.19,[n,1.4,e],"tessile",J.lino,{q:20})]}function Qp(n,e,t){return[lt(.065,.26,.075,[n,t,e],"lucido",J.ceramica,{q:14}),lt(.11,.18,.14,[n,t+.24,e],"tessile",J.lino,{q:16})]}function jp(n,e,t){return[lt(.24,.025,.26,[n,3.775,e],"lucido",J.bianco,{q:24}),lt(.15,.02,.17,[n,3.755,e],"lucido",J.bianco,{q:24}),lt(.004,3.8-t-.17,.004,[n,t+.17,e],"metallo",J.nero,{q:4}),lt(.03,.17,.2,[n,t,e],"metallo",J.nero,{q:20}),lt(.18,.005,.18,[n,t-.001,e],"lucido","#FFF6E6",{q:20})]}function js(n,e,t,i,r,o,s=!0){return Ae(s?[i,r,o]:[o,r,i],[n,e,t],"decoro","#FFFFFF",{uv:"libri"})}var wc={soggiorno:[Ae([2.7,.008,2],[2.15,0,6.72],"tessile",J.tappeto),Ae([2.4,.012,1.7],[2.15,0,6.72],"tessile",J.tappeto2),...Yg(2.15,4.93),yt([1,.045,.55],[2.15,.36,6.55],"legno",J.noce,.01,{q:1}),...Gn(2.15,6.55,1,.55,.36,J.nero,.05,.013),js(1.88,.405,6.52,.28,.06,.21),lt(.11,.07,.07,[2.45,.405,6.58],"lucido",J.ceramica,{q:16}),...fr(.69,6.75,2,.46,.64,"x+",4,J.noce,.12,{mat:"legno"}),...Gn(.69,6.75,.4,1.9,.12,J.noceS,.04,.02,"legno"),lt(.07,.3,.09,[.7,.76,6.05],"lucido",J.vaso,{q:14}),js(.7,.76,7.28,.62,.26,.2,!1),...bc(.45,1,6.75,1.3,1.3,.95,"quadro1"),...Zg(4.75,1,2.15,1.34,1.6,.92,"quadro2",J.noceS),...Kg(3.62,5.2),...Yp(3.55,7.42),yt([.95,.045,1.7],[5.25,.73,6.85],"legno",J.noce,.008,{q:1}),Ae([.8,.08,1.52],[5.25,.65,6.85],"legno",J.noceS),...Gn(5.25,6.85,.95,1.7,.73,J.noce,.07,.028,"legno"),...Fr(4.56,6.45,1,0),...Fr(4.56,7.25,1,0),...Fr(5.94,6.45,-1,0),...Fr(5.94,7.25,-1,0),lt(.17,.08,.1,[5.25,.775,6.85],"lucido",J.ceramica,{q:20}),...jp(5.25,6.85,1.96),...$p(.82,8.2,1.65,3),...Jp(2.75,3.62,8.85,-1),...Qs(1.2,2.4,8.85,-1),...Qs(4,5.2,8.85,-1)],ingresso:[...fr(4.37,1.32,1.4,.6,2.4,"x+",2,J.laccato),yt([.35,.035,1.1],[6.22,.78,1.75],"legno",J.noce,.006,{q:1}),Ae([.32,.12,1.04],[6.23,.66,1.75],"legno",J.noce),...Gn(6.22,1.75,.35,1.1,.66,J.nero,.03,.011),Ae([.03,.95,.75],[6.385,1.12,1.75],"legno",J.noceS),Ae([.01,.87,.67],[6.368,1.16,1.75],"specchio","#FFFFFF"),lt(.1,.06,.07,[6.22,.815,1.5],"lucido",J.ceramica,{q:16}),lt(.05,.26,.06,[6.22,.815,2.05],"lucido",J.vaso,{q:12}),Ae([1,.008,2.4],[5.2,0,2.35],"tessile","#7A7266"),Ae([.84,.011,2.24],[5.2,0,2.35],"tessile",J.sabbia),lt(.1,.52,.1,[4.32,0,3.98],"metallo",J.nero,{q:14}),lt(.22,.06,.17,[5.2,3.72,2.4],"lucido",J.bianco,{q:24})],cucina:[...Kp(.45,3.2,.55,"z+"),...Kp(1.15,3.35,.45,"x+"),Ae([.6,2.4,.59],[3.5,0,.85],"lucido",J.laccato),Ae([.594,1.4,.02],[3.5,.1,1.155],"lucido",J.laccato),Ae([.594,.86,.02],[3.5,1.51,1.155],"lucido",J.laccato),Ae([.012,.4,.02],[3.25,1,1.175],"metallo",J.acciaio),Ae([.012,.3,.02],[3.25,1.56,1.175],"metallo",J.acciaio),Ae([.7,.004,.42],[1.8,.901,.85],"metallo",J.acciaio),Ae([.62,.004,.34],[1.8,.903,.85],"metallo","#7E8286"),lt(.014,.3,.014,[1.8,.905,.62],"metallo",J.acciaio,{q:8}),Ae([.022,.022,.2],[1.8,1.18,.71],"metallo",J.acciaio),Ae([.54,.006,.6],[.76,.901,2.45],"lucido",J.vetroNero),Ae([.02,.46,.56],[1.065,.3,2.45],"lucido",J.vetroNero),...fr(.625,2.25,2.2,.35,.78,"x+",4,J.laccato,1.5),Ae([.75,.6,.012],[.825,.9,.556],"pietra",J.travertino),Ae([.8,.6,.012],[2.8,.9,.556],"pietra",J.travertino),Ae([.012,.6,2.2],[.456,.9,2.25],"pietra",J.travertino),Ae([.4,.02,.28],[2.75,.9,.86],"legno",J.rovere),lt(.06,.18,.06,[.72,.9,1.4],"lucido",J.ceramica,{q:12}),lt(.06,.13,.06,[.72,.9,1.58],"lucido",J.ceramica,{q:12}),lt(.45,.035,.45,[2.2,.735,3.1],"legno",J.rovere,{q:32}),lt(.035,.705,.035,[2.2,.03,3.1],"metallo",J.nero,{q:12}),lt(.24,.03,.26,[2.2,0,3.1],"metallo",J.nero,{q:24}),...Fr(1.62,3.1,1,0,J.rovere),...Fr(2.78,3.1,-1,0,J.rovere),lt(.13,.06,.08,[2.2,.77,3.1],"lucido",J.ceramica,{q:16}),Sl(.045,.04,.045,[2.16,.8,3.08],"lucido",J.limone,{q:1}),Sl(.045,.04,.045,[2.25,.8,3.13],"lucido",J.limone,{q:1}),Sl(.045,.04,.045,[2.21,.83,3.04],"lucido",J.limone,{q:1}),...jp(2.2,3.1,1.92)],disimpegno:[...bc(6.52,1,3.735,1.35,.5,.65,"quadro3",J.noce)],bagno:[Ae([1.7,.1,.75],[7.37,0,.925],"lucido",J.ceramica),Ae([1.7,.46,.08],[7.37,.1,.59],"lucido",J.ceramica),Ae([1.7,.46,.08],[7.37,.1,1.26],"lucido",J.ceramica),Ae([.08,.46,.59],[6.56,.1,.925],"lucido",J.ceramica),Ae([.08,.46,.59],[8.18,.1,.925],"lucido",J.ceramica),Ae([1.54,.01,.59],[7.37,.42,.925],"lucido",J.acqua),yt([.56,.4,.38],[8.32,0,2.05],"lucido",J.ceramica,.08,{q:1}),Ae([.16,.4,.4],[8.52,.4,2.05],"lucido",J.ceramica),Ae([.46,.4,.7],[6.75,.42,2.3],"legno",J.noce),Ae([.48,.04,.72],[6.76,.82,2.3],"pietra",J.travertino),yt([.36,.12,.44],[6.78,.86,2.3],"lucido",J.ceramica,.04,{q:1}),lt(.012,.2,.012,[6.59,.86,2.3],"metallo",J.acciaio,{q:8}),Ae([.012,.8,.6],[6.528,1.12,2.3],"specchio","#FFFFFF"),Ae([2.08,1.2,.012],[7.56,0,.556],"pietra",J.rivestimento),Ae([.012,1.2,2.4],[6.526,0,1.75],"pietra",J.rivestimento),Ae([.012,1.2,2.4],[8.594,0,1.75],"pietra",J.rivestimento),Ae([.665,1.2,.012],[6.8525,0,2.944],"pietra",J.rivestimento),Ae([.665,1.2,.012],[8.2675,0,2.944],"pietra",J.rivestimento)],cameretta:[Ae([1.5,.01,1.1],[10.05,0,2.15],"tessile","#9A9F92"),...Zp(11.55,3.4,1.95,1.22,-1,J.salvia),yt([1.2,.035,.6],[10.2,.72,.86],"legno",J.rovere,.006,{q:1}),...Gn(10.2,.86,1.2,.6,.72,J.nero,.04,.013),...Fr(10.2,1.42,0,-1,J.rovere),lt(.07,.02,.07,[10.62,.755,.72],"metallo",J.nero,{q:12}),lt(.008,.4,.008,[10.62,.775,.72],"metallo",J.nero,{q:6}),lt(.03,.12,.08,[10.62,1.1,.76],"metallo",J.nero,{q:12}),js(9.85,.755,.72,.36,.24,.18),...fr(9.02,1.5,1.6,.6,2.4,"x+",2,J.laccato),Ae([.25,.025,1],[11.42,1.55,3.4],"legno",J.rovere),js(11.43,1.575,3.4,.8,.24,.18,!1),...Qs(9.6,10.8,.55,1,3.5,.85)],camera:[Ae([2.5,.01,2.4],[7.6,0,7.05],"tessile",J.sabbia),...Zp(6.32,7.05,2.05,1.75,1),...fr(6.52,5.9,.42,.4,.48,"x+",1,J.noce,0,{mat:"legno",cassetti:2}),...fr(6.52,8.22,.42,.4,.48,"x+",1,J.noce,0,{mat:"legno",cassetti:2}),...Qp(6.52,5.9,.48),...Qp(6.52,8.22,.48),...bc(6.32,1,7.05,1.28,1.1,.75,"quadro3",J.noce),...fr(9.05,5.05,.8,.6,2.4,"z+",2,J.laccato),...fr(10.55,8.625,1.2,.45,.75,"z-",2,J.noce,0,{mat:"legno",cassetti:3}),lt(.06,.34,.08,[10.2,.75,8.66],"lucido",J.vaso,{q:12}),js(10.85,.75,8.66,.3,.06,.22),...Jp(6.95,7.85,8.85,-1,.14,.56),...Qs(6.8,8,8.85,-1),...Qs(9.6,10.8,8.85,-1,3.5,.85),...Yp(9,8.08,J.salvia),...$p(11.18,7.38,1.35,7)],bagno2:[Ae([.9,.04,.9],[11.1,0,5.2],"lucido",J.ceramica),Ae([.9,2,.008],[11.1,.04,5.65],"vetro","#FFFFFF"),lt(.1,.015,.1,[11.1,2.05,5],"metallo",J.acciaio,{q:16}),Ae([.02,.02,.26],[11.1,2.07,4.88],"metallo",J.acciaio),Ae([.012,2.1,.9],[11.544,0,5.2],"pietra",J.rivestimento),Ae([.9,2.1,.012],[11.1,0,4.756],"pietra",J.rivestimento),yt([.38,.4,.56],[10.05,.02,5.03],"lucido",J.ceramica,.08,{q:1}),Ae([.4,.4,.16],[10.05,.42,4.83],"lucido",J.ceramica),Ae([.46,.4,.7],[11.32,.42,6.35],"legno",J.noce),Ae([.48,.04,.72],[11.31,.82,6.35],"pietra",J.travertino),yt([.36,.12,.44],[11.29,.86,6.35],"lucido",J.ceramica,.04,{q:1}),lt(.012,.2,.012,[11.48,.86,6.35],"metallo",J.acciaio,{q:8}),Ae([.012,.8,.6],[11.544,1.12,6.35],"specchio","#FFFFFF")]},Tc={x0:4.07,x1:6.4};function Rc(){let n=c=>Math.round(c*100),e=ur.map(c=>({id:c.id,nome:c.nome,mq:c.rects.reduce((l,[f,h,u,d])=>l+n(u-f)*n(d-h),0)/1e4})),t=e.reduce((c,l)=>c+l.mq,0),i=Math.min(.55,.5),r=Math.min(.45/2,.25),o=Oo.w-2*.45+2*r,s=Oo.d-2*.55+2*i,a=o*s-(Tc.x1-Tc.x0)*(i-.25);return{stanze:e,netta:t,lorda:a,commerciale:Math.round(a)}}function zn(n){let e=n>>>0;return()=>{e|=0,e=e+1831565813|0;let t=Math.imul(e^e>>>15,1|e);return t=t+Math.imul(t^t>>>7,61|t)^t,((t^t>>>14)>>>0)/4294967296}}var tm=(n,e,t)=>zn(n*73856093^e*19349663^t)();function cn(n,e=n){let t=document.createElement("canvas");return t.width=n,t.height=e,t}var Bo=(n,e,t,i=1)=>`hsla(${n},${e}%,${t}%,${i})`;function ta(n,e,t,i=1){let r=t*Math.PI/180,o=e*Math.cos(r),s=e*Math.sin(r),a=(n+.3963377774*o+.2158037573*s)**3,c=(n-.1055613458*o-.0638541728*s)**3,l=(n-.0894841775*o-1.291485548*s)**3,h=[4.0767416621*a-3.3077115913*c+.2309699292*l,-1.2684380046*a+2.6097574011*c-.3413193965*l,-.0041960863*a-.7034186147*c+1.707614701*l].map(u=>(u=Math.min(1,Math.max(0,u)),Math.round(255*(u<=.0031308?12.92*u:1.055*u**(1/2.4)-.055))));return`rgba(${h[0]},${h[1]},${h[2]},${i})`}function hr(n,e,t){let i=zn(t),r=new Float32Array(e*e);for(let c=0;c<r.length;c++)r[c]=i();let o=(c,l)=>r[(l%e+e)%e*e+(c%e+e)%e],s=new Float32Array(n*n),a=e/n;for(let c=0;c<n;c++)for(let l=0;l<n;l++){let f=l*a,h=c*a,u=Math.floor(f),d=Math.floor(h),_=f-u,v=h-d,m=_*_*(3-2*_),p=v*v*(3-2*v),E=o(u,d),C=o(u+1,d),S=o(u,d+1),b=o(u+1,d+1);s[c*n+l]=E+(C-E)*m+(S-E)*p+(E-C-S+b)*m*p}return s}function Cc(n,e){let t=cn(n),i=t.getContext("2d"),r=i.createImageData(n,n),o=r.data;for(let s=0;s<n;s++)for(let a=0;a<n;a++){let[c,l,f]=e(a,s),h=(s*n+a)*4;o[h]=c,o[h+1]=l,o[h+2]=f,o[h+3]=255}return i.putImageData(r,0,0),t}var Pc=24*.07*Math.SQRT2;function im(n=1024){let e=cn(n),t=e.getContext("2d"),i=.07,r=.42,o=n/Pc;t.fillStyle="#6E5236",t.fillRect(0,0,n,n);let s=(c,l)=>[(c+l)/Math.SQRT2*o,(-c+l)/Math.SQRT2*o],a=(c,l,f,h,u,d,_)=>{let v=(u%24+24)%24,m=(d%4+4)%4,p=[s(c,l),s(c+f,l),s(c+f,l+h),s(c,l+h)],E=tm(v,m,_),C=tm(v,m,_+7),S=zn(Math.floor(E*1e9)+_),b=f>h,T=()=>{t.beginPath(),t.moveTo(...p[0]);for(let G=1;G<4;G++)t.lineTo(...p[G]);t.closePath()};T();let P=43+E*12+(C>.92?-7:C<.06?6:0),x=b?s(c,l+h/2):s(c+f/2,l),A=b?s(c+f,l+h/2):s(c+f/2,l+h),D=t.createLinearGradient(x[0],x[1],A[0],A[1]);D.addColorStop(0,Bo(31+C*5,36+E*8,P-1.5)),D.addColorStop(.5,Bo(33+C*4,38+E*8,P+1.5)),D.addColorStop(1,Bo(31+C*5,36+E*8,P-2)),t.fillStyle=D,t.fill(),t.save(),t.clip();for(let G=0;G<14;G++){let z=S(),Y=(S()-.5)*.25,N=.4+S()*1.3;t.strokeStyle=Bo(28,42,20+S()*22,.07+S()*.12),t.lineWidth=N,t.beginPath();for(let F=0;F<=8;F++){let te=F/8,$=z+Y*Math.sin(te*Math.PI*(1+S()*.5)),ae=b?s(c+te*f,l+$*h):s(c+$*f,l+te*h);F?t.lineTo(...ae):t.moveTo(...ae)}t.stroke()}if(S()<.12){let G=.2+S()*.6,z=b?s(c+G*f,l+h*(.3+S()*.4)):s(c+f*(.3+S()*.4),l+G*h);t.fillStyle=Bo(28,40,24,.35),t.beginPath(),t.ellipse(z[0],z[1],1.8,1.1,Math.PI/4,0,6.283),t.fill()}t.restore(),t.strokeStyle="rgba(40,26,14,.62)",t.lineWidth=1.2,T(),t.stroke(),t.strokeStyle="rgba(255,236,205,.10)",t.lineWidth=.8,t.beginPath(),t.moveTo(p[0][0]+1,p[0][1]+1),t.lineTo(p[1][0]+1,p[1][1]+1),t.stroke()};for(let c=-40;c<80;c++)for(let l=-14;l<14;l++){let f=c*i+l*r,h=c*i-l*r,u=s(f,h);u[0]<-700||u[0]>n+700||u[1]<-700||u[1]>n+700||(a(f,h,r,i,c,l,1),a(f+r,h+i-r,i,r,c,l,2))}return e}var Lc=2.4;function nm(n=1024){let e=cn(n),t=e.getContext("2d"),i=n/Lc,r=.3*i,o=Math.max(1.5,.005*i);t.fillStyle=ta(.74,.02,80),t.fillRect(0,0,n,n);let s=zn(11);for(let a=0;a<8;a++)for(let c=0;c<8;c++){let l=a*r+o/2,f=c*r+o/2,h=r-o,u=.555+s()*.085,d=.052+s()*.024,_=58+s()*12;t.save(),t.beginPath(),t.roundRect?t.roundRect(l,f,h,h,2.5):t.rect(l,f,h,h),t.clip(),t.fillStyle=ta(u,d,_),t.fillRect(l,f,h,h);for(let p=0;p<30;p++){let E=3+s()*r*.35,C=l+s()*h,S=f+s()*h,b=s()<.5,T=t.createRadialGradient(C,S,0,C,S,E);T.addColorStop(0,ta(u+(b?.07:-.08),d*.9,_+2,.16)),T.addColorStop(1,ta(u,d,_,0)),t.fillStyle=T,t.fillRect(C-E,S-E,2*E,2*E)}for(let p=0;p<140;p++)t.fillStyle=ta(u-.18,.03,65,.18+s()*.25),t.fillRect(l+s()*h,f+s()*h,.7+s()*1.2,.7+s()*1.2);let v=t.createLinearGradient(l,0,l+h,0);v.addColorStop(0,"rgba(40,28,18,.18)"),v.addColorStop(.06,"rgba(40,28,18,0)"),v.addColorStop(.94,"rgba(40,28,18,0)"),v.addColorStop(1,"rgba(40,28,18,.18)"),t.fillStyle=v,t.fillRect(l,f,h,h);let m=t.createLinearGradient(0,f,0,f+h);m.addColorStop(0,"rgba(40,28,18,.16)"),m.addColorStop(.06,"rgba(40,28,18,0)"),m.addColorStop(.94,"rgba(40,28,18,0)"),m.addColorStop(1,"rgba(255,240,220,.10)"),t.fillStyle=m,t.fillRect(l,f,h,h),t.restore()}return e}var Dc=2.4;function rm(n=1024){let e=cn(n),t=e.getContext("2d"),i=n/Dc,r=.6*i;t.fillStyle="#ECEBE7",t.fillRect(0,0,n,n);let o=zn(5);for(let s=0;s<4;s++)for(let a=0;a<4;a++){t.save(),t.beginPath(),t.rect(s*r,a*r,r,r),t.clip(),t.fillStyle=Bo(40,8,90+o()*4),t.fillRect(s*r,a*r,r,r);let c=o()*Math.PI;for(let l=0;l<7;l++){let f=s*r+o()*r,h=a*r+o()*r,u=Math.cos(c),d=Math.sin(c),_=o()<.35;t.strokeStyle=`rgba(118,116,112,${_?.32+o()*.2:.1+o()*.14})`,t.lineWidth=_?.9+o()*1.6:.5+o(),t.shadowColor="rgba(120,118,112,.35)",t.shadowBlur=2+o()*5,t.beginPath(),t.moveTo(f-u*r,h-d*r);for(let v=-6;v<=6;v++)f+=u*r/6+(o()-.5)*16,h+=d*r/6+(o()-.5)*16,t.lineTo(f,h);t.stroke()}t.restore(),t.strokeStyle="rgba(160,158,150,.5)",t.lineWidth=1,t.strokeRect(s*r+.5,a*r+.5,r-1,r-1)}return e}var El=1.6;function om(n=256){let e=hr(n,8,21),t=hr(n,32,22),i=hr(n,96,23);return Cc(n,(r,o)=>{let s=o*n+r,a=238+(e[s]-.5)*7+(t[s]-.5)*5+(i[s]-.5)*4;return[a,a,a]})}var bl=1.2;function sm(n=512){let e=cn(n),t=e.getContext("2d"),i=zn(31),r=hr(n,6,32),o=hr(n,48,33),s=t.createImageData(n,n),a=s.data;for(let c=0;c<n;c++){let l=c/n,f=Math.sin(l*Math.PI*2*3)*.5+Math.sin(l*Math.PI*2*11+1.3)*.3+Math.sin(l*Math.PI*2*29+.4)*.2;for(let h=0;h<n;h++){let u=c*n+h,d=234+f*5+(r[c*4%n*n+h]-.5)*6+(o[u]-.5)*4,_=u*4;a[_]=d+2,a[_+1]=d-1,a[_+2]=d-7,a[_+3]=255}}t.putImageData(s,0,0);for(let c=0;c<16;c++){let l=i()*n;t.strokeStyle=`rgba(150,132,104,${.1+i()*.12})`,t.lineWidth=.6+i()*1.2,t.beginPath();for(let f=-8;f<=n+8;f+=16){let h=l+Math.sin(f/70+c)*3+(i()-.5)*2;f<0?t.moveTo(f,h):t.lineTo(f,h)}t.stroke()}for(let c=0;c<260;c++){let l=i()*n,f=i()*n,h=1+i()*5,u=.5+i()*1.1;t.fillStyle=`rgba(138,120,94,${.08+i()*.16})`;for(let[d,_]of[[0,0],[-n,0],[0,-n],[-n,-n]])t.beginPath(),t.ellipse(l+d,f+_,h,u,0,0,6.283),t.fill()}return e}var Ic=.9;function am(n=512){let e=zn(41),t=hr(n,4,42),i=hr(n,64,43),r=Array.from({length:5},()=>e()*6.283);return Cc(n,(o,s)=>{let a=s*n+o,c=s/n,l=o/n,f=Math.sin((c*34+t[a]*3.2+Math.sin(l*6.283+r[0])*.35)*6.283)*.5+.5,h=Math.sin((c*170+t[a]*9)*6.283)*.5+.5,u=216+f*13+h*3+(i[a]-.5)*9;return[u,u*.97,u*.93]})}var lm=.24;function cm(n=256){let e=hr(n,16,51);return Cc(n,(t,i)=>{let r=t%4<2?1:0,o=i%4<2?1:0,s=r^o?5:-5,a=i*n+t,c=232+s+(e[a]-.5)*7;return[c,c,c]})}function fm(){let n=cn(4),e=n.getContext("2d");return e.fillStyle="#FFFFFF",e.fillRect(0,0,4,4),n}function um(n=128){let e=cn(2*n,n),t=e.getContext("2d"),i=t.createLinearGradient(0,0,0,n);i.addColorStop(0,"rgba(0,0,0,1)"),i.addColorStop(.35,"rgba(0,0,0,.42)"),i.addColorStop(1,"rgba(0,0,0,0)"),t.fillStyle=i,t.fillRect(0,0,n,n);let r=t.createRadialGradient(1.5*n,n/2,0,1.5*n,n/2,n/2);return r.addColorStop(0,"rgba(0,0,0,.9)"),r.addColorStop(.55,"rgba(0,0,0,.35)"),r.addColorStop(1,"rgba(0,0,0,0)"),t.fillStyle=r,t.fillRect(n,0,n,n),e}function hm(n=128){let e=cn(2*n,n),t=e.getContext("2d"),i=t.createLinearGradient(0,0,0,n);i.addColorStop(0,"rgba(255,214,160,.78)"),i.addColorStop(.55,"rgba(255,227,184,1)"),i.addColorStop(1,"rgba(255,238,210,1)"),t.fillStyle=i,t.fillRect(0,0,n,n);let r=t.createLinearGradient(0,0,n,0);r.addColorStop(0,"rgba(120,80,40,.38)"),r.addColorStop(.16,"rgba(120,80,40,0)"),r.addColorStop(.84,"rgba(120,80,40,0)"),r.addColorStop(1,"rgba(120,80,40,.38)"),t.fillStyle=r,t.fillRect(0,0,n,n);let o=t.createRadialGradient(1.5*n,n/2,0,1.5*n,n/2,n/2);return o.addColorStop(0,"rgba(255,227,184,.9)"),o.addColorStop(.3,"rgba(255,227,184,.32)"),o.addColorStop(1,"rgba(255,227,184,0)"),t.fillStyle=o,t.fillRect(n,0,n,n),e}var Fc={quadro1:[0,0,.5,.5],quadro2:[.5,0,1,.5],libri:[0,.5,1,.625],quadro3:[0,.625,.5,1],pieghe:[.5,.625,1,.75],neutro:[.75,.8,1,1]};function dm(n=512){let e=cn(n),t=e.getContext("2d"),i=zn(61),r=n/2;t.fillStyle="#EDEAE3",t.fillRect(0,0,n,n),t.fillStyle="#D9D2C3",t.fillRect(0,0,r,r);let o=(f,h,u,d,_)=>{t.fillStyle=_,t.globalAlpha=.92,t.fillRect(f,h,u,d),t.globalAlpha=1};o(24,26,r-48,r*.42,"#3E4A5C"),o(24,26+r*.46,r-48,r*.16,"#B59B6A"),o(24,26+r*.66,r-48,r*.24,"#7F8A74");for(let f=0;f<400;f++)t.fillStyle=`rgba(255,255,255,${i()*.06})`,t.fillRect(i()*r,i()*r,2,2);t.fillStyle="#E6E1D6",t.fillRect(r,0,r,r),t.fillStyle="#C9C2B2",t.fillRect(r+18,r*.58,r-36,r*.34),t.strokeStyle="#4A5360",t.lineWidth=2,t.beginPath(),t.moveTo(r+18,r*.58);for(let f=0;f<=r-36;f+=8)t.lineTo(r+18+f,r*.58-10*Math.sin(f/40)-6*Math.sin(f/13));t.stroke(),t.fillStyle="#6C7866";for(let f=0;f<7;f++){let h=r+40+i()*(r-80);t.fillRect(h,r*.46,3,r*.12),t.beginPath(),t.ellipse(h+1.5,r*.44,10,16,0,0,6.283),t.fill()}let s=r,a=n*.625,c=0,l=["#3E4452","#8E8981","#C9C0B1","#56606C","#B8A58A","#2A3342","#E2DDD2","#6E675F","#7F8A74","#A89F90"];for(;c<n;){let f=6+i()*12,h=l[Math.floor(i()*l.length)],u=s+i()*10;t.fillStyle=h,t.fillRect(c,u,f-1,a-u),t.fillStyle="rgba(255,255,255,.18)",t.fillRect(c+2,u+8,f-5,2),t.fillRect(c+2,a-12,f-5,2),c+=f}for(let f=0;f<r;f++){let h=f/r,u=.8+.2*(.5+.5*Math.cos(h*Math.PI*2*6))-.05*Math.pow(Math.sin(h*Math.PI*12+1),8),d=Math.round(255*u);t.fillStyle=`rgb(${d},${d},${d})`,t.fillRect(r+f,n*.625,1,n*.125)}t.fillStyle="#F1EEE7",t.fillRect(0,n*.625,r,n*.375);for(let f=0;f<9;f++)t.fillStyle=f%2?"#56606C":"#B59B6A",t.fillRect(30+f*22,n*.66,12,n*.3);return e}function pm(n,e){let t=cn(512,64*n.length),i=t.getContext("2d");return i.clearRect(0,0,t.width,t.height),i.fillStyle=e,i.textAlign="center",i.textBaseline="middle",i.font='500 40px "JetBrains Mono", ui-monospace, monospace',n.forEach((r,o)=>i.fillText(r,256,32+o*64)),t}function Uc(n,e,t){let i=n==="planimetria"||n==="lucido",r=i?1536:512,o=i?Math.round(1536*10.6/15):724,s=cn(r,o),a=s.getContext("2d"),c={visura:"VISURA",planimetria:"PLANIMETRIA",lucido:"PLANIMETRIA",ape:"APE",conformita:"CONFORMIT\xC0"}[n];if(i){let f=r/15,h=1.5*f,u=.6*f,d=n==="lucido";d||(a.fillStyle="#FBFAF7",a.fillRect(0,0,r,o));let _=d?"#FFFFFF":"#16161A";a.strokeStyle=_,a.fillStyle=_,a.lineWidth=d?3:1;for(let[v,[m,p,E,C]]of e.WALLS.entries())v!==8&&(d?a.strokeRect(h+m*f,u+p*f,(E-m)*f,(C-p)*f):a.fillRect(h+m*f,u+p*f,(E-m)*f,(C-p)*f));for(let v of e.OPENINGS){let[m,p,E,C]=e.WALLS[v.wall],S=E-m>=C-p;if(a.save(),a.globalCompositeOperation=d?"destination-out":"source-over",a.fillStyle="#FBFAF7",S?a.fillRect(h+(v.c-v.w/2)*f+2,u+p*f-3,v.w*f-4,(C-p)*f+6):a.fillRect(h+m*f-3,u+(v.c-v.w/2)*f+2,(E-m)*f+6,v.w*f-4),a.restore(),(v.k==="finestra"||v.k==="portafinestra")&&S){a.strokeStyle=_,a.lineWidth=1.5;for(let b of[.38,.62]){let T=u+(p+(C-p)*b)*f;a.beginPath(),a.moveTo(h+(v.c-v.w/2)*f,T),a.lineTo(h+(v.c+v.w/2)*f,T),a.stroke()}}}return d||(a.font='700 30px "JetBrains Mono", monospace',a.fillStyle="#16161A",a.fillText(c,r-350,o-38),a.strokeStyle="#16161A",a.lineWidth=2,a.strokeRect(r-380,o-92,350,74),a.fillStyle="#D3D3DA",a.fillRect(r-364,o-30,220,6)),s}a.fillStyle="#FBFAF7",a.fillRect(0,0,r,o),a.fillStyle="#16161A",a.font='700 26px "JetBrains Mono", monospace';let l=(f,h,u,d)=>{let _=zn(n.length*97);for(let v=0;v<u;v++)a.fillStyle=v===0?t:"#D3D3DA",a.fillRect(f,h+v*26,d*(.45+_()*.55),9)};if(a.fillText(c,40,64),a.fillStyle=t,a.fillRect(40,84,60,5),l(40,130,6,420),n==="ape")["#1C2A6B","#24378A","#2E46A6","#4A60B8","#7283C8","#9CA8D8","#C5CCE8"].forEach((h,u)=>{a.fillStyle=h,a.fillRect(40,330+u*34,140+u*38,26)});else if(n==="visura")for(let f=0;f<5;f++)a.strokeStyle="#D3D3DA",a.lineWidth=2,a.strokeRect(40,330+f*52,432,40),a.fillStyle="#E4E4E9",a.fillRect(52,344+f*52,120+f*37%160,10);else a.strokeStyle=t,a.lineWidth=6,a.beginPath(),a.arc(256,470,90,0,6.283),a.stroke(),a.beginPath(),a.moveTo(206,472),a.lineTo(244,510),a.lineTo(310,434),a.stroke();return a.strokeStyle="#E4E4E9",a.lineWidth=2,a.strokeRect(14,14,r-28,o-28),s}var ia=new L(6,0,4.7),gm=n=>n<0?0:n>1?1:n,Je=(n,e,t)=>gm((n-e)/(t-e)),wt=n=>n*n*n*(n*(n*6-15)+10),Nc=n=>1-Math.pow(1-n,3),rt=(n,e,t)=>n+(e-n)*t,An=Math.PI/180,oi=3.8,b3="4.0.0",T3=[.85,1.7,2.48,3.85,4.85],A3=[[2.44,2.52],[2.655,2.72],[2.875,2.95]],Tl=Rc(),$g={netta:Math.round(Tl.netta*100)/100,lorda:Math.round(Tl.lorda*100)/100,commerciale:Tl.commerciale,stanze:ur.map(n=>{let[e,t,i,r]=n.rects[0],o=n.rects.length===1,s=Tl.stanze.find(c=>c.id===n.id).mq,a=c=>Math.round(c*100)/100;return{id:n.id,nome:n.nome,netta:a(s),w:o?a(i-e):null,d:o?a(r-t):null,cx:a((e+i)/2),cz:a((t+r)/2)}})},Qg=n=>rt(-1.2,13.2,wt(Je(n,.08,.62))),_m=2.41,jg=3.01,mm=n=>rt(_m,jg,wt(Je(n,1.66,1.72))),e_=n=>new Promise(e=>setTimeout(e,n)),Go=()=>new Promise(n=>typeof requestIdleCallback=="function"?requestIdleCallback(()=>n(),{timeout:200}):setTimeout(n,16));function Oc(n){if(!n.index){let e=n.attributes.position.count,t=new(e>65535?Uint32Array:Uint16Array)(e);for(let i=0;i<e;i++)t[i]=i;n.setIndex(new Vt(t,1))}return n}var Al=new Ee;function fn(n,e="#FFFFFF",t=0,i=0,r=null){Oc(n);let o=n.attributes.position.count,s=new Float32Array(o*3),a=new Float32Array(o);Al.set(e);for(let h=0;h<o;h++)s[h*3]=Al.r,s[h*3+1]=Al.g,s[h*3+2]=Al.b,a[h]=t;n.setAttribute("color",new Vt(s,3)),n.setAttribute("aStanza",new Vt(a,1));let c=n.attributes.uv,l=n.attributes.position,f=n.attributes.normal;if(i)for(let h=0;h<o;h++){let u=Math.abs(f.getX(h)),d=Math.abs(f.getY(h)),_=Math.abs(f.getZ(h)),v=l.getX(h),m=l.getY(h),p=l.getZ(h);u>=d&&u>=_?c.setXY(h,p/i,m/i):d>=_?c.setXY(h,v/i,p/i):c.setXY(h,v/i,m/i)}else if(r){let[h,u,d,_]=r;for(let v=0;v<o;v++)c.setXY(v,h+c.getX(v)*(d-h),1-_+c.getY(v)*(_-u))}return n}var Ei=n=>n.length?qp(n.map(Oc)):null;function _t(n,e,t,i,r,o){if(i-n<.001||r-e<.001||o-t<.001)return null;let s=new vi(i-n,r-e,o-t);return s.translate((n+i)/2,(e+r)/2,(t+o)/2),s}async function w3(n,e={}){var zc;let t=Object.assign({notte:"#111D36",notte2:"#1B2A45",luce:"#F2EFE8",nebbia:"#C5CEDE",accentoChiaro:"#96C0FE",accento:"#173FA4",oro:"#FFD700",boom:"#060607",casa:"#FFE3B8"},e.token||{}),i=e.layout||"desktop",r=e.profilo==="leggero",o=i==="mobile"||r,s=new Js({canvas:n,antialias:!0,alpha:!0,premultipliedAlpha:!0,powerPreference:"high-performance",stencil:!1,preserveDrawingBuffer:!!e.conserva,failIfMajorPerformanceCaveat:!!e.esigente});s.setClearColor(0,0),s.outputColorSpace=ei,s.toneMapping=Wr,s.toneMappingExposure=1,s.shadowMap.enabled=!0,s.shadowMap.type=Yn,s.shadowMap.autoUpdate=!1,s.localClippingEnabled=!0;let a=!0,c=-1,l=null,f=y=>{y.preventDefault(),a=!1,e.onPerso&&e.onPerso()},h=()=>{a=!0,l=null,c>=0&&mr(c),e.onRipristino&&e.onRipristino()};n.addEventListener("webglcontextlost",f,!1),n.addEventListener("webglcontextrestored",h,!1);let u=new Ar,d=new lr(s),_=new Ml,v=d.fromScene(_,.04);d.dispose(),_.dispose(),u.environment=v.texture,u.environmentIntensity=.62;let m=new ri(30,1,.05,400),p=new Ki;p.position.copy(ia),u.add(p);let E=new Ki;E.position.set(-ia.x,0,-ia.z),p.add(E),await Go();let C=Math.min(8,s.capabilities.getMaxAnisotropy()),S=(y,R=!0)=>{let V=new zs(y);return V.colorSpace=ei,V.wrapS=V.wrapT=R?xr:di,V.anisotropy=C,V},b={};b.spina=S(im(1024)),await Go(),b.cotto=S(nm(o?512:1024)),b.marmo=S(rm(o?512:1024)),await Go(),b.intonaco=S(om(256)),b.travertino=S(sm(o?256:512)),b.legno=S(am(o?256:512)),b.trama=S(cm(256)),b.bianco=S(fm()),b.decoro=S(dm(512),!1),b.occlusione=S(um(),!1),b.sera=S(hm(),!1);try{await Promise.race([document.fonts.load('500 40px "JetBrains Mono"'),e_(1200)])}catch{}await Go();let T=new Mi(new L(0,-1,0),Nr),P={uCade:{value:new Array(9).fill(0)},uAlza:{value:new Array(9).fill(1)}},x=y=>{Object.assign(y.uniforms,P),y.vertexShader=y.vertexShader.replace("#include <common>",`#include <common>
attribute float aStanza;
uniform float uCade[9];
uniform float uAlza[9];`).replace("#include <begin_vertex>",`#include <begin_vertex>
{ int si = int(aStanza + 0.5); transformed.y = transformed.y * uAlza[si] + uCade[si]; }`)},A=(y,R,V,I={})=>{let K=new Sn(Object.assign({color:y,roughness:R,metalness:0,map:V,vertexColors:!0,dithering:!0,clippingPlanes:[T],clipShadows:!0},I));return K.onBeforeCompile=x,K.customProgramCacheKey=()=>"boom-lit4",K},D=new Dr;D.onBeforeCompile=x,D.customProgramCacheKey=()=>"boom-ombra4";let G={uScan:{value:-2},uBp:{value:new Ee(t.notte2)},uGrid:{value:new Ee(t.accentoChiaro)}},z=(y,R)=>{let V=new Sn({color:"#FFFFFF",roughness:R,metalness:0,map:y,dithering:!0});return V.onBeforeCompile=I=>{Object.assign(I.uniforms,G),I.vertexShader=I.vertexShader.replace("#include <common>",`#include <common>
varying vec3 vWp;`).replace("#include <worldpos_vertex>",`#include <worldpos_vertex>
vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;`),I.fragmentShader=I.fragmentShader.replace("#include <common>",`#include <common>
varying vec3 vWp; uniform float uScan; uniform vec3 uBp, uGrid;`).replace("#include <colorspace_fragment>",`
          float rv = smoothstep(uScan + 0.06, uScan - 0.06, vWp.x);
          vec2 g1 = abs(fract(vWp.xz * 2.0 + 0.5) - 0.5) / max(fwidth(vWp.xz * 2.0), vec2(1e-4));
          vec2 g2 = abs(fract(vWp.xz + 0.5) - 0.5) / max(fwidth(vWp.xz), vec2(1e-4));
          float l1 = 1.0 - min(min(g1.x, g1.y), 1.0), l2 = 1.0 - min(min(g2.x, g2.y), 1.0);
          vec3 bp = mix(uBp, uGrid, max(l1 * 0.14, l2 * 0.30));
          gl_FragColor.rgb = mix(bp, gl_FragColor.rgb, rv);
          float dx = abs(vWp.x - uScan), acceso = step(-1.0, uScan) * step(uScan, 13.0);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, uGrid, exp(-dx * 7.0) * 0.55 * acceso);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0), smoothstep(0.035, 0.0, dx) * acceso);
          #include <colorspace_fragment>`)},V.customProgramCacheKey=()=>"boom-pav4",V},Y=(y,R={})=>new vn(Object.assign({color:y,map:b.bianco,transparent:!0,opacity:1,toneMapped:!1,depthWrite:!1},R)),N=(y,R=0)=>new Lr({color:y,transparent:!0,opacity:R,toneMapped:!1,depthWrite:!1}),F={spina:z(b.spina,.52),cotto:z(b.cotto,.78),marmo:z(b.marmo,.22),intonaco:A("#EDE9E1",.92,b.intonaco),pietra:A("#FFFFFF",.7,b.travertino),lucido:A("#FFFFFF",.34,b.bianco),legno:A("#FFFFFF",.66,b.legno,{envMapIntensity:.35}),tessile:A("#FFFFFF",.96,b.trama,{envMapIntensity:.5}),metallo:A("#FFFFFF",.36,b.bianco,{metalness:.75}),specchio:A("#8F959B",.06,b.bianco,{metalness:1,envMapIntensity:.55}),decoro:A("#FFFFFF",.82,b.decoro,{envMapIntensity:.5}),persiana:A("#FFFFFF",.6,b.bianco,{metalness:.3}),vetro:new Sn({color:"#CFE0E8",roughness:.04,metalness:0,transparent:!0,opacity:.14,depthWrite:!1,side:wi,clippingPlanes:[T]}),sezione:new vn({color:t.luce,side:Rt,toneMapped:!1,clippingPlanes:[T],polygonOffset:!0,polygonOffsetFactor:1,polygonOffsetUnits:2}),ao:Y("#000000",{map:b.occlusione,opacity:0}),carta:Y("#16161A",{opacity:0}),foglioPiano:null,giorno:Y("#F4F0E8",{opacity:1}),cifre:null,terra:new Vs({opacity:.35}),quota:Y(t.accentoChiaro,{opacity:0}),arco:N(t.accentoChiaro,.6),finestre:N(t.accentoChiaro,.6),ringhiera:N(t.nebbia),fantasma:N(t.nebbia),filo:N(t.oro)};F.giorno.depthWrite=!0;let te={soggiorno:4.2,camera:4.26,cucina:4.32,cameretta:4.38,bagno:4.44},$={},ae={};for(let y of Object.keys(te))$[y]=Y("#FFFFFF",{map:b.sera,opacity:0}),ae[y]=Y("#FFFFFF",{map:b.sera,opacity:0,blending:Xo});let j=y=>y.wall===1?y.c<6.2?"soggiorno":"camera":y.c<4?"cucina":y.c<8.6?"bagno":"cameretta",re=y=>{let[R,V,I,K]=ea[y.wall],ne=I-R>=K-V;return{lx:ne,a0:ne?R:V,a1:ne?I:K,b0:ne?V:R,b1:ne?K:I}},oe=(y,R,{ombra:V=!0,riceve:I=!0,ordine:K=0}={})=>{if(!y)return null;let ne=new We(y,R);return ne.castShadow=V,ne.receiveShadow=I,ne.renderOrder=K,V&&R.customProgramCacheKey&&R.customProgramCacheKey()==="boom-lit4"&&(ne.customDepthMaterial=D),E.add(ne),ne},Ge={spina:Pc,cotto:Lc,marmo:Dc},Oe={spina:[],cotto:[],marmo:[]},Dt=(y,R,V,I,K,ne)=>{let fe=new ni(V-y,I-R);fe.rotateX(-Math.PI/2),fe.translate((y+V)/2,K,(R+I)/2);let le=fe.attributes.uv,He=fe.attributes.position;for(let Xe=0;Xe<le.count;Xe++)le.setXY(Xe,He.getX(Xe)/Ge[ne],-He.getZ(Xe)/Ge[ne]);Oe[ne].push(fe)};for(let y of ur)y.rects.forEach(([R,V,I,K])=>Dt(R-.02,V-.02,I+.02,K+.02,0,y.pav));let at=[],ct=[],xt=[],ye=[],pt=[],Gt=[],Ie=(y,R)=>{R&&y.push(R)};ea.forEach(([y,R,V,I],K)=>{let ne=V-y>=I-R,fe=ne?y:R,le=ne?V:I,He=ne?R:y,Xe=ne?I:V,et=(De,$e,ut,Fi)=>{De-=.003,ut+=.003,Ie(at,ne?_t(De,$e,He,ut,Fi,Xe):_t(He,$e,De,Xe,Fi,ut))},mt=Tn.filter(De=>De.wall===K).sort((De,$e)=>De.c-$e.c),Pt=fe;for(let De of mt){let $e=De.c-De.w/2,ut=De.c+De.w/2;if(et(Pt,0,$e,oi),et($e,0,ut,De.y0),et($e,De.y1,ut,oi),Pt=ut,De.k==="finestra"||De.k==="portafinestra"){let Fi=K===0?He:Xe,Ni=K===0?Xe:He,gr=Math.sign(Fi-Ni),Ai=Ni+gr*(Xe-He)*.33,Oi=.06,Lt=.065,gn=De.y0+(De.y1-De.y0)*.72,hi=(Mt,Ft,It,nn,_n)=>Ie(_n,ne?_t(Mt,Ft,Ai-Oi/2,It,nn,Ai+Oi/2):_t(Ai-Oi/2,Ft,Mt,Ai+Oi/2,nn,It));hi($e,De.y0,$e+Lt,De.y1,ct),hi(ut-Lt,De.y0,ut,De.y1,ct),hi($e,De.y1-Lt,ut,De.y1,ct),hi($e,De.y0,ut,De.y0+Lt,ct),hi(De.c-.03,De.y0,De.c+.03,De.y1,ct),hi($e,gn,ut,gn+.05,ct);let nt=ne?_t($e+Lt,De.y0+Lt,Ai-.004,ut-Lt,De.y1-Lt,Ai+.004):null;nt&&xt.push(nt);for(let Mt of[.4,.6]){let Ft=He+(Xe-He)*Mt;Gt.push($e,.012,Ft,ut,.012,Ft)}Gt.push($e,.012,He,$e,.012,Xe,ut,.012,He,ut,.012,Xe)}else pt.push({q:De,lx:ne,s0:$e,s1:ut,b0:He,b1:Xe})}et(Pt,0,le,oi)});for(let y of Tn){if(!(y.wall===0||y.wall===1))continue;let R=y.wall===0?-.05:9.4,V=y.wall===0?0:9.45,I=y.c-y.w/2,K=y.c+y.w/2,ne=.14,fe=y.wall===0?-1:1;if(y.k==="portone"){Ie(ye,_t(I-ne,0,V-.003,I,y.y1+ne,.001)),Ie(ye,_t(K,0,V-.003,K+ne,y.y1+ne,.001));continue}Ie(ye,_t(I-ne,y.y0,R,I,y.y1+ne,V)),Ie(ye,_t(K,y.y0,R,K+ne,y.y1+ne,V)),Ie(ye,_t(I-ne,y.y1,R,K+ne,y.y1+ne,V)),y.y0>0&&Ie(ye,_t(I-ne-.04,y.y0-.07,Math.min(R,V)-(fe<0?.04:0),K+ne+.04,y.y0,Math.max(R,V)+(fe>0?.04:0)));let le=fe<0?-.13:9.4,He=fe<0?0:9.53;Ie(ye,_t(I-ne-.1,y.y1+ne+.04,le,K+ne+.1,y.y1+ne+.14,He))}Ie(ye,_t(-.04,-.02,9.4,12.04,.16,9.49)),Ie(ye,_t(-.04,-.02,-.09,12.04,.16,0)),Ie(ye,_t(-.04,-.415,9.4,12.04,-.02,9.44)),Ie(ye,_t(-.04,-.415,-.04,12.04,-.02,0));let Et=[],ci=(y,R,V,I)=>{let K=[];for(let[ne,fe,le,He]of ea){let Xe=le-ne>=He-fe;if(y!==Xe)continue;let et=y?[fe,He]:[ne,le];if(Math.abs(et[0]-R)>.001&&Math.abs(et[1]-R)>.001)continue;let mt=Math.max(V,y?ne:fe),Pt=Math.min(I,y?le:He);Pt-mt>.02&&K.push([mt,Pt])}return K},si=(y,R)=>{let V=y;for(let[I,K]of R){let ne=[];for(let[fe,le]of V)K<=fe||I>=le?ne.push([fe,le]):(I>fe&&ne.push([fe,I]),K<le&&ne.push([K,le]));V=ne}return V.filter(([I,K])=>K-I>.03)},zt=new Set(["soggiorno","camera","ingresso","cameretta"]);for(let y of ur)for(let[R,V,I,K]of y.rects)for(let[ne,fe,le,He,Xe]of[[!0,V,R,I,1],[!0,K,R,I,-1],[!1,R,V,K,1],[!1,I,V,K,-1]]){let et=ci(ne,fe,le,He),mt=Tn.filter(De=>{let $e=re(De);return $e.lx===ne&&De.y0===0&&(Math.abs($e.b0-fe)<.001||Math.abs($e.b1-fe)<.001)}).map(De=>[De.c-De.w/2,De.c+De.w/2]),Pt=(De,$e,ut,Fi,Ni)=>ne?_t(De,ut,Xe>0?fe:fe-Ni,$e,Fi,Xe>0?fe+Ni:fe):_t(Xe>0?fe:fe-Ni,ut,De,Xe>0?fe+Ni:fe,Fi,$e);if(y.pav!=="marmo")for(let[De,$e]of si(et,mt))Ie(Et,Pt(De,$e,0,.09,.014));if(zt.has(y.id))for(let[De,$e]of et)Ie(Et,Pt(De,$e,oi-.1,oi,.035)),Ie(Et,Pt(De,$e,oi-.15,oi-.1,.018))}for(let{q:y,lx:R,s0:V,s1:I,b0:K,b1:ne}of pt)for(let[fe,le]of[[K,-1],[ne,1]]){if(y.k==="portone"&&le<0)continue;let He=(Xe,et,mt,Pt)=>R?_t(Xe,et,le>0?fe:fe-.016,mt,Pt,le>0?fe+.016:fe):_t(le>0?fe:fe-.016,et,Xe,le>0?fe+.016:fe,Pt,mt);Ie(Et,He(V-.075,0,V,y.y1+.075)),Ie(Et,He(I,0,I+.075,y.y1+.075)),Ie(Et,He(V-.075,y.y1,I+.075,y.y1+.075))}for(let{lx:y,s0:R,s1:V,b0:I,b1:K}of pt)Dt(y?R:I,y?I:R,y?V:K,y?K:V,.0015,"marmo");let bi=Ei(at.map(y=>fn(y,"#FFFFFF",0,El))),Di=oe(bi,F.intonaco);oe(Ei(ye.map(y=>fn(y,"#D8CFBE",0,bl))),F.pietra),oe(Ei([...ct,...Et].map(y=>fn(y,"#EFEBE4"))),F.lucido),E.add(new We(Ei(xt),F.vetro));let Yt=new We(bi,F.sezione);E.add(Yt);let Wt={};for(let y of Object.keys(Oe))Wt[y]=new We(Ei(Oe[y]),F[y]),Wt[y].receiveShadow=!0,E.add(Wt[y]);let fi=[],Xt=[...new Set(Tn.filter(y=>(y.wall===0||y.wall===1)&&y.k!=="portone").map(y=>y.c))].sort((y,R)=>y-R);for(let y of Tn){if(!((y.wall===0||y.wall===1)&&(y.k==="finestra"||y.k==="portafinestra")))continue;let R=y.y1-y.y0,V=y.w/2-.004,I=y.wall===0?1:-1,K=y.wall===0?-.07:9.47;for(let ne of[1,-1]){let fe=[],le=(mt,Pt,De,$e,ut)=>{let[Fi,Ni]=ne>0?[mt,De]:[-De,-mt];Ie(fe,_t(Fi,Pt,-ut/2,Ni,$e,ut/2))};le(0,0,.05,R,.035),le(V-.05,0,V,R,.035),le(0,0,V,.07,.035),le(0,R-.07,V,R,.035),R>2&&le(0,R*.42,V,R*.42+.06,.035);let He=Math.floor((R-.14)/.1);for(let mt=0;mt<He;mt++){let Pt=.07+(mt+.5)*(R-.14)/He,De=new vi(V-.1,.008,.05);De.rotateX(-I*38*An),De.translate(ne*V/2,Pt,0),fe.push(De)}let Xe=new Ki;Xe.position.set(ne>0?y.c-y.w/2:y.c+y.w/2,y.y0,K);let et=new We(Ei(fe.map(mt=>fn(mt,"#2A3342"))),F.persiana);et.castShadow=!0,et.receiveShadow=!0,et.customDepthMaterial=D,Xe.add(et),E.add(Xe),fi.push({piv:Xe,lato:ne,verso:I,k:Xt.indexOf(y.c)})}}let Ht=[];for(let y of Tn)if(y.parapetto){let R=y.c-y.w/2-.05,V=y.c+y.w/2+.05,I=9.52;Ie(Ht,_t(R,.96,I-.02,V,1,I+.02)),Ie(Ht,_t(R,.1,I-.012,V,.13,I+.012));for(let K=R;K<=V+.001;K+=.11)Ie(Ht,_t(K-.008,.1,I-.008,K+.008,.98,I+.008))}let B=[],ui=[],vt=new L(0,1,0);for(let{q:y,lx:R,s0:V,s1:I,b0:K,b1:ne}of pt){let fe=(K+ne)/2,le=.045,He=y.k==="portone",Xe=y.k==="doppia"?[{h:V,w:y.w/2-.005,verso:1},{h:I,w:y.w/2-.005,verso:-1}]:[{h:y.hinge?I:V,w:y.w-.02,verso:y.hinge?-1:1}];for(let et of Xe){let mt=y.y1-.02,Pt=[],De=He?"#3A2D24":"#ECE8E0",$e=(It,nn,_n,qn,Hr,Vc,Rm=De)=>{let Hc=_t(Math.min(It,_n),nn,Math.min(Hr,Vc),Math.max(It,_n),qn,Math.max(Hr,Vc));Hc&&Pt.push(fn(Hc,Rm,0,He?Ic:0))},ut=et.verso;$e(0,0,ut*et.w,mt,-le/2,le/2);let Fi=.1,Ni=et.w-.2;for(let[It,nn]of He?[[.14,mt*.46],[mt*.52,mt-.14]]:[[.16,mt*.42],[mt*.48,mt-.14]])for(let _n of[-1,1])$e(ut*Fi,It,ut*(Fi+Ni),nn,_n*le/2,_n*(le/2+.008));let gr=He?"#B08D57":"#B8BABD",Ai=ut*(et.w-.07),Oi=He?1.1:1.02;for(let It of[-1,1])$e(Ai-.012,Oi-.06,Ai+.012,Oi+.06,It*le/2,It*(le/2+.012),gr),$e(Ai,Oi-.012,Ai-ut*.12,Oi+.012,It*(le/2+.03),It*(le/2+.05),gr);let Lt=new Ki,gn=new We(Ei(Pt),He?F.legno:F.lucido);gn.castShadow=!0,gn.receiveShadow=!0,gn.customDepthMaterial=D,Lt.add(gn);let hi=fe+y.side*((ne-K)/2-le/2);R?Lt.position.set(et.h,0,hi):(Lt.position.set(hi,0,et.h),Lt.rotation.y=-Math.PI/2);let nt=-et.verso*y.side*(R?1:-1)*(Math.PI/2);Lt.userData={apre:nt*(y.k==="doppia"?115/90:1),base:Lt.rotation.y},Lt.visible=!1,E.add(Lt),B.push(Lt);let Mt=18,Ft=[];for(let It=0;It<=Mt;It++){let nn=new L(et.verso*et.w,0,0).applyAxisAngle(vt,nt*It/Mt+Lt.rotation.y);Ft.push([Lt.position.x+nn.x,Lt.position.z+nn.z])}for(let It=0;It<Mt;It++)ui.push(Ft[It][0],.012,Ft[It][1],Ft[It+1][0],.012,Ft[It+1][1]);ui.push(Lt.position.x,.012,Lt.position.z,Ft[Mt][0],.012,Ft[Mt][1])}}let w=(y,R)=>{let V=new Ct;V.setAttribute("position",new gt(y,3));let I=new Ao(V,R);return E.add(I),I},g=w(ui,F.arco),H=w(Gt,F.finestre),q=["soggiorno","ingresso","cucina","disimpegno","bagno","cameretta","camera","bagno2"],Z={},ue=[],ge=[],Q={legno:Ic,tessile:lm,pietra:bl};for(let[y,R]of Object.entries(wc)){let V=q.indexOf(y)+1;for(let I of R){let K;I.t==="rbox"?K=new vl(I.s[0],I.s[1],I.s[2],I.q||1,Math.min(I.r,I.s[0]/2,I.s[1]/2,I.s[2]/2)*.999):I.t==="cyl"?K=new el(I.s[0],I.s[2],I.s[1],I.q||16,1):I.t==="sfera"?(K=new nl(1,I.q||1),K.scale(I.s[0],I.s[1],I.s[2])):K=new vi(I.s[0],I.s[1],I.s[2]),I.rot&&(K.rotateX(I.rot[0]),K.rotateY(I.rot[1]),K.rotateZ(I.rot[2]));let ne=I.t==="sfera"?I.s[1]:I.s[1]/2;if(K.translate(I.p[0],I.p[1]+ne,I.p[2]),I.m==="vetro"){ue.push(Oc(K));continue}let fe=I.uv?Fc[I.uv]:I.m==="decoro"?Fc.neutro:null,le=Math.max(I.s[0],I.s[1],I.s[2])>(I.t==="cyl"?.9:.34)&&I.s[1]>.02;(Z[zc=I.m+(le?"":"~")]||(Z[zc]=[])).push(fn(K,I.c||"#FFFFFF",V,fe?0:Q[I.m]||0,fe));let He=I.s[0]*I.s[2];I.t!=="cyl"&&I.t!=="sfera"&&I.p[1]<=.15&&I.s[1]>.15&&He>.12&&ge.push([I.p[0],I.p[2],I.s[0]*1.3+.12,I.s[2]*1.3+.12])}}Z.metallo=(Z.metallo||[]).concat(Ht.map(y=>fn(y,"#2A2C31")));let ie=[];for(let[y,R]of Object.entries(Z)){let V=y.replace("~","");ie.push(oe(Ei(R),F[V],{ombra:V!=="specchio"&&!y.endsWith("~")}))}let pe=new We(Ei(ue),F.vetro);pe.visible=!1,E.add(pe);let Fe=[],_e=(y,R,V,I,K,ne,fe)=>{let le=new ni(V,I);le.rotateX(-Math.PI/2);let He=le.attributes.uv;for(let Xe=0;Xe<He.count;Xe++)He.setX(Xe,ne+He.getX(Xe)*(fe-ne));le.rotateY(K),le.translate(y,.006,R),Fe.push(le)};for(let y of ur)for(let[R,V,I,K]of y.rects)_e((R+I)/2,V+.17,I-R,.34,0,0,.5),_e((R+I)/2,K-.17,I-R,.34,Math.PI,0,.5),_e(R+.17,(V+K)/2,K-V,.34,-Math.PI/2,0,.5),_e(I-.17,(V+K)/2,K-V,.34,Math.PI/2,0,.5);for(let[y,R,V,I]of ge)_e(y,R,V,I,0,.5,1);let de=new We(Ei(Fe),F.ao);de.renderOrder=2,de.visible=!1,E.add(de);let Ue=fn(new ni(Oo.w-.9,Oo.d-1.1).rotateX(Math.PI/2).translate(6,oi-.002,4.7),"#F3F0EA"),ze=oe(Ue,F.intonaco),ke=new Ki;ke.visible=!1,E.add(ke);let O=Ei([_t(0,0,0,12,.3,9.4),_t(-.12,.16,9.26,12.12,.3,9.74),_t(-.06,.06,9.32,12.06,.16,9.6),_t(-.12,.16,-.34,12.12,.3,.14)].map(y=>fn(y,"#E9E4DA",0,El))),me=new We(O,F.intonaco);me.castShadow=!0,me.receiveShadow=!0,me.customDepthMaterial=D,ke.add(me),oe(fn(_t(0,-.415,0,12,-.015,9.4),"#E3DED3",0,El),F.intonaco);let ee=new We(new ni(90,90),F.terra);ee.rotation.x=-Math.PI/2,ee.position.y=-.43,ee.receiveShadow=!0,u.add(ee);let he=new Ki;he.visible=!1,E.add(he);let Se=new We(fn(_t(3.6,-.315,-2.8,6.9,-.015,0),"#D8CFBE",0,bl),F.pietra);Se.receiveShadow=!0,Se.castShadow=!0,Se.customDepthMaterial=D,he.add(Se);let se=[],Ce=(y,R)=>se.push(...y,...R);for(let y of[-.015,1])Ce([3.6,y,-2.8],[6.9,y,-2.8]),Ce([3.6,y,-2.8],[3.6,y,0]);for(let y=3.6;y<=6.91;y+=.11)Ce([y,-.015,-2.8],[y,1,-2.8]);for(let y=-2.8;y<=.01;y+=.11)Ce([3.6,-.015,y],[3.6,1,y]);for(let y=0;y<3;y++){let R=6.9+y*.3,V=-.015-(y+1)*.17;for(let I of[-2.8,-1.5])Ce([R,V+.17,I],[R,V,I]),Ce([R,V,I],[R+.3,V,I]);Ce([R,V,-2.8],[R,V,-1.5])}let Le=new Ao(new Ct().setAttribute("position",new gt(se,3)),F.ringhiera);he.add(Le);let ot=[],tt=(y,R,V,I)=>{ot.push(y,.02,R,V,.02,I);for(let[K,ne]of[[y,R],[V,I]])ot.push(K-.12,.02,ne+.12,K+.12,.02,ne-.12)};tt(0,10.35,12,10.35),tt(.45,9.85,6.2,9.85),tt(6.32,9.85,11.55,9.85),tt(-.95,0,-.95,9.4),tt(-.45,.55,-.45,4.4),tt(-.45,4.75,-.45,8.85);for(let[y,R,V]of[[0,9.4,10.45],[12,9.4,10.45],[.45,8.85,9.95],[6.2,8.85,9.95],[6.32,8.85,9.95],[11.55,8.85,9.95]])ot.push(y,.02,R+.08,y,.02,V);for(let[y,R,V]of[[0,-1.05,0],[9.4,-1.05,0],[.55,-.55,.45],[4.4,-.55,.45],[4.75,-.55,.45],[8.85,-.55,.45]])ot.push(R,.02,y,V-.06,.02,y);let Ii=[];for(let y=0;y<ot.length;y+=6){let R=ot[y],V=ot[y+2],I=ot[y+3],K=ot[y+5],ne=Math.hypot(I-R,K-V),fe=new ni(ne+.03,.03);fe.rotateX(-Math.PI/2),fe.rotateY(-Math.atan2(K-V,I-R)),fe.translate((R+I)/2,.02,(V+K)/2),Ii.push(fe)}let Ti=new We(Ei(Ii),F.quota);Ti.renderOrder=3,E.add(Ti);let Vn=y=>y.toFixed(2).replace(".",","),zo=[[Vn(12),6,10.66,0],[Vn(6.2-.45),3.325,10.13,0],[Vn(11.55-6.32),8.935,10.13,0],[Vn(9.4),-1.26,4.7,1],[Vn(4.4-.55),-.73,2.475,1],[Vn(8.85-4.75),-.73,6.8,1]],na=S(pm(zo.map(y=>y[0]),"#FFFFFF"),!1);F.cifre=Y(t.accentoChiaro,{map:na,opacity:0});let Vo=zo.map(([,y,R,V],I)=>{let K=new ni(2.08,.26),ne=K.attributes.uv,fe=zo.length;for(let le=0;le<ne.count;le++)ne.setY(le,1-(I+1-ne.getY(le))/fe);return K.rotateX(-Math.PI/2),V&&K.rotateY(Math.PI/2),K.translate(y,.025,R),K}),Or=new We(Ei(Vo),F.cifre);Or.renderOrder=3,E.add(Or);let dr=["visura","planimetria","ape","conformita"].map(y=>{let R=y==="planimetria"?15:3.2,V=y==="planimetria"?10.6:4.52,I=new ni(R,V);I.rotateX(-Math.PI/2);let K=new We(I,Y("#FFFFFF",{map:S(Uc(y,yl,t.accento),!1),opacity:1,depthWrite:!1}));return K.visible=!1,K.renderOrder=3,E.add(K),K}),un=new ni(15,10.6);un.rotateX(-Math.PI/2);let en=new We(un,Y(t.accentoChiaro,{map:S(Uc("lucido",yl,t.accento),!1),opacity:0}));en.renderOrder=4,en.visible=!1,dr[1].add(en),en.position.y=.002;let Ho=new ni(2.08,.18);Ho.rotateX(-Math.PI/2);let Hn=new We(Ho,F.carta);Hn.renderOrder=5,Hn.position.set(7.56-6,.004,_m-4.7),dr[1].add(Hn);let tn=new Ki;tn.visible=!1,E.add(tn);let Br={},kn={};for(let y of Object.keys(te))Br[y]=[],kn[y]=[];for(let y of Tn){if(!(y.k==="finestra"||y.k==="portafinestra")||y.wall!==0&&y.wall!==1)continue;let R=j(y),V=y.wall===0,I=y.w-.02,K=y.y1-y.y0-.02,ne=new ni(I,K),fe=ne.attributes.uv;for(let le=0;le<fe.count;le++)fe.setX(le,fe.getX(le)*.5);if(V&&ne.rotateY(Math.PI),ne.translate(y.c,(y.y0+y.y1)/2,V?.62:8.78),Br[R].push(ne),!r){let le=new ni(2.6,2.6),He=le.attributes.uv;for(let Xe=0;Xe<He.count;Xe++)He.setX(Xe,.5+He.getX(Xe)*.5);V&&le.rotateY(Math.PI),le.translate(y.c,(y.y0+y.y1)/2,V?-.3:9.7),kn[R].push(le)}}for(let[y,R]of Object.entries(kn))if(R.length){let V=new We(Ei(R),ae[y]);V.renderOrder=5,tn.add(V)}for(let[y,R]of Object.entries(Br))if(R.length){let V=new We(Ei(R),$[y]);V.renderOrder=7,tn.add(V)}let Gr=[],ko=y=>{for(let R=0;R<y.length;R++){let V=y[R],I=y[(R+1)%y.length];Gr.push(...V,...I)}};for(let[y,R]of[[-.415,0],[-.02,0],[oi,0],[oi+.3,.12]])ko([[-R,y,-R],[12+R,y,-R],[12+R,y,9.4+R],[-R,y,9.4+R]]);for(let[y,R]of[[0,0],[12,0],[12,9.4],[0,9.4]])Gr.push(y,-.415,R,y,oi+.3,R);for(let y of Tn)if(y.wall===0||y.wall===1){let R=y.wall===0?-.052:9.452,V=y.c-y.w/2-.14,I=y.c+y.w/2+.14;ko([[V,y.y0,R],[I,y.y0,R],[I,y.y1+.14,R],[V,y.y1+.14,R]])}let ra=w(Gr,F.filo);F.filoPieno=Y(t.oro,{opacity:0});let oa=[];for(let[y,R,V,I,K]of[[oi+.241,.06,9.745,-.345,.12],[-.415,.05,9.442,-.042,.04],[.12,.04,9.492,-.092,.04]])for(let[ne,fe]of[[V,0],[I,Math.PI]]){let le=new ni(12+2*K,R);le.rotateY(fe),le.translate(6,y+R/2,ne),oa.push(le)}let zr=new We(Ei(oa),F.filoPieno);zr.renderOrder=6,zr.visible=!1,E.add(zr);let pr=new Ki;pr.visible=!1,E.add(pr);for(let[y,R]of[[10.6,Math.PI],[-3.2,0]]){let V=new We(new ni(24,9),F.giorno);V.position.set(6,2,y),V.rotation.y=R,pr.add(V)}let wn=[],M=(y,R,V,I,K)=>wn.push(y,R,K,V,R,K,V,R,K,V,I,K,V,I,K,y,I,K,y,I,K,y,R,K);for(let[y,R,V]of[[-4.6,-.415,"botteghe"],[4.1,7.9,"finestre"],[7.9,11.3,"finestre"]]){for(let I of[0,9.4])M(0,y,12,R,I);for(let I of[0,12])wn.push(I,y,0,I,y,9.4,I,R,0,I,R,9.4);for(let I of[0,9.4])for(let K of[1.8,4.6,7.4,10.2])if(V==="finestre")M(K-.6,y+.8,K+.6,y+3,I),M(K-.74,y+3.14,K+.74,y+3.24,I);else{wn.push(K-.9,y,I,K-.9,y+2.4,I,K+.9,y,I,K+.9,y+2.4,I);for(let ne=0;ne<14;ne++){let fe=Math.PI-ne*Math.PI/14,le=Math.PI-(ne+1)*Math.PI/14;wn.push(K+.9*Math.cos(fe),y+2.4+.9*Math.sin(fe),I,K+.9*Math.cos(le),y+2.4+.9*Math.sin(le),I)}}}M(-.3,11.3,12.3,11.75,9.7),M(-.3,11.3,12.3,11.75,-.3);for(let y of[-.3,12.3])wn.push(y,11.3,-.3,y,11.3,9.7,y,11.75,-.3,y,11.75,9.7);let U=w(wn,F.fantasma);U.visible=!1;let k=new qs("#FFE6C2",2.6);k.castShadow=!0;let W=o?1024:2048;k.shadow.mapSize.set(W,W),Object.assign(k.shadow.camera,{left:-12,right:12,top:12,bottom:-12,near:1,far:75}),k.shadow.camera.updateProjectionMatrix(),k.shadow.bias=-4e-4,k.shadow.normalBias=.03,k.shadow.radius=o?2.5:3.5,u.add(k),u.add(k.target),k.target.position.copy(ia);let X=new ks("#FFF3E2","#C4B094",.4);u.add(X);let xe=null;r||(xe=new Ws("#D6E4FF",0,4.6,.62,.9,2),xe.position.set(1.8,2.9,.75),xe.target.position.set(2,0,2.6),E.add(xe),E.add(xe.target));let Me=e.larghezza||1,ce=e.altezza||1,Te=e.dpr||1,we=0,Ve=[[2,[19,21,-12],[6,1.2,4.7],40,0],[2.18,[15,14,-11],[5.8,1,3.5],42,0],[2.26,[8,4.5,-6],[5.3,1.4,1],46,.04],[2.3,[5.2,1.6,-2.2],[5.2,1.55,3],54,.08],[2.33,[5.2,1.55,.27],[5.15,1.5,4],58,.1],[2.37,[5.15,1.45,2.5],[5,1.42,6.5],60,.12],[2.405,[5.12,1.41,3.2],[5,1.4,8.85],60,.12],[2.44,[5.1,1.4,3.55],[4.95,1.4,8.85],60,.12],[2.52,[5.1,1.4,3.62],[4.95,1.4,8.85],60,.12],[2.545,[5,2.9,3.4],[3.8,1.2,2.5],62,.06],[2.57,[4.6,4.8,3.9],[2.6,1,2.2],62,0],[2.595,[3.9,5.2,4.4],[1.8,1,1.4],62,0],[2.615,[3.72,3.9,4.18],[1.5,1.2,1],62,.04],[2.635,[3.7,2.5,4.16],[1.4,1.35,.95],62,.08],[2.655,[3.7,1.36,4.15],[1.3,1.36,.9],62,.12],[2.72,[3.68,1.36,4.13],[1.3,1.36,.88],62,.12],[2.745,[3.65,2.9,4.1],[4.5,1.2,3],64,.06],[2.77,[4.6,4.8,4.8],[8,1,6.5],64,0],[2.8,[8.5,5.8,7.8],[7.5,1,6.6],66,0],[2.825,[9.3,5.2,8.3],[7,1,6.4],68,0],[2.845,[9.32,3.9,8.5],[6.8,1.2,6.2],70,.04],[2.86,[9.33,2.4,8.53],[6.5,1.3,6.05],72,.08],[2.875,[9.33,1.32,8.55],[6.4,1.3,6],72,.12],[2.95,[9.32,1.32,8.53],[6.4,1.3,5.96],72,.12],[3.02,[9.3,3.2,8.4],[8,1.6,6.5],60,.05],[3.08,[12.5,6,14],[7,1.6,5.5],48,0],[3.2,[15,3,25],[6,2.2,4.7],34,.02],[3.6,[16,-2.2,38],[6,3.8,4.7],32,.06],[3.95,[15,-2.6,39],[6,3.8,4.7],32,.06],[4.4,[15.5,-1.9,38.5],[6,3.2,4.7],30,.05],[5,[14.8,-1.6,37],[6,3,4.7],30,.05]],je=new Ro(Ve.map(y=>new L(...y[1])),!1,"centripetal"),Pe=new Ro(Ve.map(y=>new L(...y[2])),!1,"centripetal");function ht(y){let R=0;for(;R<Ve.length-2&&y>Ve[R+1][0];)R++;let V=gm((y-Ve[R][0])/(Ve[R+1][0]-Ve[R][0])),I=(R+V)/(Ve.length-1);return{pos:je.getPoint(I),tgt:Pe.getPoint(I),hfov:rt(Ve[R][3],Ve[R+1][3],wt(V)),sv:rt(Ve[R][4],Ve[R+1][4],wt(V))}}function Nt(y,R){return i==="desktop"?{sx:rt(.16,.12,y),sy:R,lw:rt(.6,.62,y),vh:1,hw:.26,hh:.43}:i==="mobile"?{sx:0,sy:.16+R*.6,lw:rt(.94,1,y),vh:.5,hw:.46,hh:.18}:{sx:0,sy:R*.5,lw:rt(.9,1,y),vh:1,hw:.44,hh:.42}}let bt=new L(0,1,0),St=new L(0,0,-1);function Zt(y){let R=Nt(0,0),V=ce*(1+2*R.sy),I=V/2/Math.tan(6*An),K=Math.min(R.hw*Me*2/15.2,R.hh*ce*2/12.4),ne=rt(1,.95,wt(Je(y,0,.9))),fe=rt(0,.06,wt(Je(y,0,.9))),le=I/K*ne;return{pos:new L(5.4,le,5.25+.001),tgt:new L(5.4,0,5.25),f:I,up:new L(Math.sin(fe),0,-Math.cos(fe)),sx:R.sx,sy:R.sy}}function be(y,R,V){let I=R.lw*Me/2/Math.tan(y*An/2);if(V){let K=R.vh*ce/2,ne=2*Math.atan(K/I)/An;ne<40&&(I=K/Math.tan(20*An)),ne>80&&(I=K/Math.tan(40*An))}return I}function ai(y,R){if(y<1.72)return Zt(Math.min(y,1));let V=ht(Math.max(y,2)),I=y>2.3&&y<3.04,K=Nt(R,V.sv),ne=be(V.hfov,K,I);if(y>=2)return{pos:V.pos,tgt:V.tgt,f:ne,up:bt,sx:K.sx,sy:K.sy};let fe=Zt(1),le=wt(Je(y,1.72,2)),He=fe.pos.clone().lerp(V.pos,le),Xe=fe.tgt.clone().lerp(V.tgt,le),et=fe.f/fe.pos.distanceTo(fe.tgt),mt=ne/V.pos.distanceTo(V.tgt),Pt=Math.exp(rt(Math.log(et),Math.log(mt),le));return{pos:He,tgt:Xe,f:Pt*He.distanceTo(Xe),up:fe.up.clone().lerp(bt,le).normalize(),sx:rt(fe.sx,K.sx,le),sy:rt(fe.sy,K.sy,le)}}let it=0,li=0;function Wi(y){let R=Me*(1+2*it),V=ce*(1+2*li);m.aspect=R/V,m.fov=2*Math.atan(V/2/y)/An,it||li?m.setViewOffset(R,V,0,2*li*ce,Me,ce):m.clearViewOffset(),m.updateProjectionMatrix()}let hn=(y,R)=>{let V=y*An,I=R*An;return new L(Math.sin(I)*Math.cos(V),Math.sin(V),-Math.cos(I)*Math.cos(V)).multiplyScalar(32).add(ia)},Wn=new Ee("#EDE9E1"),ft=new Ee("#161618"),Ot=new Ee(t.luce),dn=new Ee(t.oro),Tt=new Ee("#FFE6C2"),pn=new Ee("#FFC98F"),Xn=new Ee("#FFB36B"),Vr=new Ee("#FFFFFF"),xm=new Ee("#16161A"),Mm=new Ee(t.accentoChiaro),Rl={},vm=y=>y<1.76?"pianta":y>1.96&&y<2?"assono":y>2.42&&y<3.02?"interni":null,Bc={pianta:Nr,assono:oi-.001,interni:oi-.001},Sm=new L;function mr(y){let R=Math.min(5,Math.max(0,+y||0));c=R;let V=Qg(R);G.uScan.value=R>.7?100:V;let I=wt(Je(R,2.1,2.4)),K=wt(Je(R,3.02,3.4)),ne=wt(Je(R,4,4.45)),fe=I*(1-K),le=ai(R,fe);it=le.sx,li=le.sy,m.up.copy(le.up),m.position.copy(le.pos),m.lookAt(le.tgt);let He=le.pos.distanceTo(le.tgt),Xe=le.pos.y<oi+.4&&le.pos.y>-.5&&R>2.28&&R<3.05;m.near=Xe?.03:Math.max(.1,He-40),m.far=He+70,Wi(le.f);let et=rt(Nr,oi-.001,wt(Je(R,1.76,1.96))),mt=wt(Je(R,2.38,2.42))*(1-wt(Je(R,3.04,3.16)));if(mt>0){let nt=le.pos.y>2.55?2.4:rt(oi-.001,2.4,wt(Je(le.pos.y,1.6,2.55)));et=rt(et,Math.min(et,nt),mt)}R>3.16&&(et=100);let Pt=wt(Je(R,.35,.6))*(1-Je(R,1,1.1));F.quota.opacity=Pt,F.cifre.opacity=Pt,Ti.visible=Or.visible=Pt>.001,F.arco.opacity=.6*(1-Je(R,2.02,2.16)),g.visible=F.arco.opacity>.001,F.finestre.opacity=.6*(1-Je(R,1.76,1.9)),H.visible=F.finestre.opacity>.001,dr.forEach((nt,Mt)=>{let Ft=Nc(Je(R,1.04+Mt*.08,1.18+Mt*.08)),It=Sm.set(7+Mt*1.05,5+Mt*.3,2.6+Mt%2*.9),nn=new L(14+Mt,16,-8);nt.visible=Ft>0&&R<1.8,nt.position.copy(nn).lerp(It,Ft),nt.rotation.set(0,rt(.9,-.16+Mt*.1,Ft),0);let _n=1;if(Mt===1){let qn=wt(Je(R,1.44,1.6));nt.position.lerp(new L(6,Nr+.02,4.7),qn),nt.rotation.y=rt(nt.rotation.y,0,qn),_n=rt(.3,1,qn);let Hr=wt(Je(R,1.52,1.6));nt.material.opacity=(1-Hr)*(1-Je(R,1.72,1.8)),en.visible=Hr>0,en.material.opacity=.92*Hr*(1-Je(R,1.72,1.8))}else{let qn=wt(Je(R,1.52,1.66));nt.position.lerp(new L(18,12,.5+Mt),qn),nt.material.opacity=1-qn}nt.scale.setScalar(_n)});let De=wt(Je(R,1.52,1.6)),$e=R>=1.6;F.carta.color.copy(De>.5?Mm:xm);let ut=Je(R,1.6,1.625),Fi=ut>0&&ut<1?.35+.65*(.5-.5*Math.cos(ut*Math.PI*4)):1;F.carta.opacity=($e?Fi:rt(1,.92,De))*(1-Je(R,1.72,1.8)),Hn.position.z=mm(R)-4.7,Hn.scale.z=$e&&R<1.72?1.35:1;for(let nt of fi){let Mt=wt(Je(R,2.02+nt.k*.012,2.11+nt.k*.012));nt.piv.visible=R>1.76,nt.piv.rotation.y=nt.lato*nt.verso*100*An*Mt}let Ni=R>2.04&&R<4.3;for(let nt of ie)nt&&(nt.visible=Ni);q.forEach((nt,Mt)=>{let Ft=Je(R,2.04+Mt*.022,2.11+Mt*.022);P.uCade.value[Mt+1]=Ft>0?(1-Nc(Ft))*.25:-100,P.uAlza.value[Mt+1]=rt(.94,1,Nc(Ft))}),pe.visible=Je(R,2.04+7*.022,2.11+7*.022)>.6;let gr=wt(Je(R,2.04,2.18));for(let nt of B)nt.visible=gr>0,nt.rotation.y=nt.userData.base+nt.userData.apre*gr;F.ao.opacity=.3*Je(R,2.04,2.22)*(1-Je(R,3.1,3.2)),de.visible=F.ao.opacity>.001,he.visible=R>1.76&&R<3.6,F.ringhiera.opacity=.42*Je(R,1.78,1.96)*(1-Je(R,3.3,3.6));let Ai=rt(rt(66,20,I),32,K),Oi=rt(rt(195,212,I),228,K);Ai=rt(Ai,8,ne),Oi=rt(Oi,262,ne),k.position.copy(hn(Ai,Oi)),k.intensity=rt(rt(3,5.2,fe),.18,ne),k.color.copy(Tt).lerp(pn,fe).lerp(Xn,ne),u.environmentIntensity=rt(rt(.36,.46,fe),.06,ne),X.intensity=rt(rt(.55,.7,fe),.03,ne),s.toneMappingExposure=rt(1,1.04,fe),xe&&(xe.intensity=8*fe),pr.visible=R>2.318&&R<3.02,ze.castShadow=R>2.28&&R<3.04;let Lt=wt(Je(R,3.18,3.45));ke.visible=Lt>0,ke.position.set(0,rt(12,oi+.001,Lt),0);let gn=wt(Je(R,3.3,3.6))*(1-wt(Je(R,4.05,4.4))*.45);U.visible=gn>.01,F.fantasma.opacity=.42*gn,p.rotation.y=rt(0,.32,wt(Je(R,3.15,3.95)))+rt(0,.18,wt(Je(R,4,5))),ee.visible=R<3.12,F.terra.opacity=.35*(1-Je(R,3.02,3.12)),F.intonaco.color.copy(Wn).lerp(ft,ne),F.sezione.color.copy(Ot).lerp(dn,ne),F.pietra.color.copy(Vr).lerp(ft,ne),F.lucido.color.copy(Vr).lerp(ft,ne*.92),F.persiana.color.copy(Vr).lerp(ft,ne*.6),F.filo.opacity=wt(Je(R,4.1,4.5)),ra.visible=F.filo.opacity>.001,F.filoPieno.opacity=F.filo.opacity,zr.visible=ra.visible,tn.visible=R>4.15;for(let[nt,Mt]of Object.entries(te)){let Ft=wt(Je(R,Mt,Mt+.06));$[nt].opacity=.9*Ft,ae[nt].opacity=.34*Ft}let hi=vm(R);a&&(hi&&hi===l?(T.constant=et,s.shadowMap.needsUpdate=!1,s.render(u,m)):hi&&Math.abs(Bc[hi]-et)>1e-4?(T.constant=Bc[hi],s.shadowMap.needsUpdate=!0,s.render(u,m),T.constant=et,s.shadowMap.needsUpdate=!1,s.render(u,m)):(T.constant=et,s.shadowMap.needsUpdate=!0,s.render(u,m)),l=hi,Rl={calls:s.info.render.calls,tris:s.info.render.triangles})}function ym(y,R,V,I){Me=Math.max(1,y),ce=Math.max(1,R),V&&(Te=V),I&&(i=I),s.setPixelRatio(we>=1?Math.max(1,Te*.8):Te),s.setSize(Me,ce,!1),l=null,c>=0&&mr(c)}function Em(y){y>we&&(we=Math.min(3,y),we>=1&&(s.setPixelRatio(Math.max(1,Te*.8)),s.setSize(Me,ce,!1)),we>=2&&(k.shadow.mapSize.set(1024,1024),k.shadow.radius=1.5,k.shadow.map&&(k.shadow.map.dispose(),k.shadow.map=null)),we>=3&&(k.castShadow=!1),l=null,c>=0&&mr(c))}let mn=new L,Gc={rogito:()=>mn.set(6,4.4,4.7),boom:()=>mn.set(6,4.45,4.7),noncombacia:()=>mn.set(7.56,Nr+.05,mm(c))};for(let y of $g.stanze){let R=ur.find(V=>V.id===y.id).rects[0];Gc[y.id]=()=>mn.set((R[0]+R[2])/2,.05,(R[1]+R[3])/2)}function bm(y){let R=Gc[y];if(!R||c<0)return{x:0,y:0,visibile:!1};R(),E.updateWorldMatrix(!0,!1),E.localToWorld(mn);let V=mn.clone().applyMatrix4(m.matrixWorldInverse).z<0;mn.project(m);let I=(mn.x+1)/2*Me,K=(1-mn.y)/2*ce;return{x:I,y:K,visibile:V&&mn.z<1&&I>-40&&I<Me+40&&K>-40&&K<ce+40}}function Tm(){return{dpr:+s.getPixelRatio().toFixed(2),profilo:r?"leggero":"pieno",qualita:we,programs:s.info.programs?s.info.programs.length:0,calls:Rl.calls||0,tris:Rl.tris||0,layout:i}}function Am(){n.removeEventListener("webglcontextlost",f),n.removeEventListener("webglcontextrestored",h);let y=new Set;u.traverse(R=>{R.geometry&&!y.has(R.geometry)&&(y.add(R.geometry),R.geometry.dispose());let V=R.material;V&&(Array.isArray(V)?V:[V]).forEach(I=>{I.map&&I.map.dispose(),I.dispose()})});for(let R of Object.values(b))R.dispose();D.dispose(),v.dispose(),s.dispose()}await Go(),Me=e.larghezza||Me,ce=e.altezza||ce,s.setPixelRatio(Te),s.setSize(Me,ce,!1);for(let y of Object.values(b))s.initTexture(y);await Go();let wm=[ke,U,he,tn,pr,de,pe,en,Ti,Or,...dr,...B,...fi.map(y=>y.piv)];a=!1,mr(2.6),a=!0,wm.forEach(y=>{y.visible=!0});try{s.compileAsync&&await s.compileAsync(u,m)}catch{}return mr(2.6),l=null,mr(0),{imposta:mr,proietta:bm,dimensiona:ym,qualita:Em,info:Tm,distruggi:Am,renderer:s,scene:u,camera:m}}export{$g as PIANTA,T3 as POSE,A3 as SCATTI,b3 as VERSIONE,w3 as monta,Qg as rilievoX,mm as zCarta};
