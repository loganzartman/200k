var Flow = {
	w: Math.min(960, Math.floor(window.innerWidth/1)),
	h: Math.min(700, Math.floor(window.innerHeight/1)),
	N: 200000,
	nProps: 5,
	t0: Date.now(),
	prevTime: Date.now(),
	frameTime: 0,
	insertIdx: 0,

	settings: {
		gravity: 0.65,
		centerGravity: 0.0,
		wind: 0.35,
		friction: 0.0,
		edgeMode: "remove",

		number: 20,
		speed: 0.5,
		spread: 0.5,
		interactMode: "add",

		useBlending: false
	},

	init: function() {
		document.title = (""+Flow.N).replace(/(\d{3})(?!$)/g,"$1,")+" particles";
		
		Flow.particles = new Float32Array(Flow.N * Flow.nProps);
		
		//precalculate colors for each particle
		Flow.pColors = new Uint8Array(Flow.N*4);
		Flow.pColorsBuffer = new Uint8Array(Flow.w*Flow.h*4);
		Flow.resetColors();

		//DOM
		Flow.output = document.getElementById("display");
		Flow.canvas = document.createElement("canvas");
		Flow.output.width = Flow.canvas.width = Flow.canvas.style.width = Flow.w;
		Flow.output.height = Flow.canvas.height = Flow.canvas.style.height = Flow.h;
		var mouseEvent = function(x,y){
			Mouse.x = Math.min(Flow.w, Math.max(0, x - Flow.output.offsetLeft));
			Mouse.y = Math.min(Flow.h, Math.max(0, y - Flow.output.offsetTop));
		}
		document.addEventListener("mousemove", function(event){mouseEvent(event.pageX, event.pageY);}, false);
		document.addEventListener("touchmove", function(event){mouseEvent(event.targetTouches[0].pageX, event.targetTouches[0].pageY);}, false);

		//dat.gui
		var gui = new dat.GUI();
		var phys = gui.addFolder("Physics");
		phys.add(Flow.settings, "gravity").min(0).max(1).step(0.05);
		phys.add(Flow.settings, "centerGravity").min(0).max(1).step(0.05);
		phys.add(Flow.settings, "wind").min(0).max(1).step(0.05);
		phys.add(Flow.settings, "friction").min(0).max(1).step(0.05);
		phys.add(Flow.settings, "edgeMode", ["remove", "wrap"]);
		var inte = gui.addFolder("Interaction");
		inte.add(Flow.settings, "interactMode", ["add", "push"]);
		inte.add(Flow.settings, "number").min(0).max(40).step(1);
		inte.add(Flow.settings, "speed").min(0).max(1).step(0.1);
		inte.add(Flow.settings, "spread").min(0).max(Math.PI).step(0.1);
		inte.add({"loadImage": function(){
			var input = document.createElement("input");
			input.setAttribute("type", "file");
			input.addEventListener("change", function(event){
				if (!(input.files) || !(input.files[0])) return;
				var reader = new FileReader();
	    		reader.onload = function(e) {
	    			var fr = new FileReader();
	    			fr.onload = function(e2) {
	    				Flow.fromImage(e2.target.result);
	    			}
	    			fr.readAsDataURL(input.files[0]);
	    		};
	    		reader.readAsText(this.files[0]);
	        }, false);
	        input.click();
		}}, "loadImage");
		var rend = gui.addFolder("Rendering");
		rend.add(Flow, "resetColors");
		rend.add(Flow.settings, "useBlending");

		//image data buffers
		Flow.octx = Flow.output.getContext("2d");
		Flow.ctx = Flow.canvas.getContext("2d");
		Flow.idata = Flow.ctx.getImageData(0,0,Flow.w,Flow.h);
		Flow.buffer = new ArrayBuffer(Flow.idata.data.length);
		Flow.buffer8 = new Uint8ClampedArray(Flow.buffer);
		Flow.buffer32 = new Uint32Array(Flow.buffer);

		//start rendering
		Flow.draw();
	},

	/**
	 * Generate a packed 32-bit RGBA color from four RGBA components
	 */
	color: function(r,g,b,a) {
		return (a<<24)|(b<<16)|(g<<8)|(r);
	},

	/**
	 * Update particles and draw to canvas
	 */
	draw: function() {
		var w = Flow.canvas.width;
		var h = Flow.canvas.height;

		//timing
		var now = Date.now();
		var t = (now - Flow.t0)/1000;
		var dt = now - Flow.prevTime;
		Flow.frameTime = Flow.frameTime*0.9 + dt*0.1;
		Flow.prevTime = now;

		//add particles at mouse cursor
		var dx = Mouse.x - Mouse.px,
			dy = Mouse.y - Mouse.py;
		var len = Math.sqrt(dx*dx+dy*dy);
		var dir = Math.atan2(dy,dx);
		var steps = Math.min(Math.floor(len), 200);
		len /= dt;
		var pps = Flow.settings.number;
		var spd = Flow.settings.speed;
		var spread = Flow.settings.spread;
		dx /= steps;
		dy /= steps;
		var posX = Mouse.px,
			posY = Mouse.py;
		if (len > 0 && Flow.settings.interactMode === "add")
		for (var j=0; j<steps; j++) {
			for (var k=0; k<pps; k++) {
				Flow.insertIdx = (Flow.insertIdx+1)%Flow.N;
				var idx = Flow.insertIdx*Flow.nProps;
				Flow.particles[idx+0] = 1;

				//set initial position (interpolated)
				Flow.particles[idx+1] = posX+dx*j;
				Flow.particles[idx+2] = posY+dy*j;

				//randomize initial velocity
				var dir2 = dir + Math.random()*spread-spread/2;
				var len2 = (Math.random()*0.5+0.5)*len*8*spd;

				//set initial velocity
				Flow.particles[idx+3] = Math.cos(dir2)*len2 + Math.random()*2 - 1;
				Flow.particles[idx+4] = Math.sin(dir2)*len2 + Math.random()*2 - 1;
			}
		}

		//record previous mouse position
		Mouse.px = Mouse.x;
		Mouse.py = Mouse.y;

		//there is a slight performance penalty for accessing properties;
		//it's better to only do this once.
		var particles = Flow.particles;
		var gravity = Flow.settings.gravity;
		var cgravity = Flow.settings.centerGravity;
		var wind = Flow.settings.wind;
		var friction = 1-Flow.settings.friction;
		var sin = FastMath.sin;
		var blending = Flow.settings.useBlending;
		var buffer32 = Flow.buffer32, pColors = Flow.pColors, pColorsBuffer = Flow.pColorsBuffer, nProps = Flow.nProps;
		var wrap = Flow.settings.edgeMode === "wrap";
		var touch = false;
		if (Flow.settings.interactMode === "push" && len > 0) {
			touch = true;
			var mouseForceX = Math.cos(dir)*len*Flow.settings.speed*7;
			var mouseForceY = Math.sin(dir)*len*Flow.settings.speed*7;
		}
		
		//clear to background color
		var bcol = Flow.color(13,11,10,255);
		for (var i=0,j=w*h; i<j; i++) {
			buffer32[i] = bcol;
			var i4 = i*4;
			if (blending) {
				pColorsBuffer[i4] = 0;
				pColorsBuffer[i4+1] = 0;
				pColorsBuffer[i4+2] = 0;
				pColorsBuffer[i4+3] = 255;
			}
		}

		//physics and drawing
		for (i=0,j=particles.length; i<j; i+=Flow.nProps) {
			//skip inactive particles
			if (particles[i+0] === 0) continue;

			//integrate velocity
			particles[i+1] += particles[i+3];
			particles[i+2] += particles[i+4];

			//convenience
			var x = particles[i+1];
			var y = particles[i+2];

			//center gravity
			var gx=0, gy=0;
			if (cgravity !== 0) {
				gx = x - w*0.5;
				gy = y - h*0.5;
				var dist = Math.sqrt(gx*gx+gy*gy);
				gx /= dist;
				gy /= dist;
			}
			
			//wind
			var wx=0, wy=0;
			if (wind !== 0) {
				wx = sin(y*0.012 + t*1.24) * 2.5 * wind;
				// wx = (sin(y*0.012 + t*1.24) * 2.5 + sin(y*0.028 + t*6.25) * 1.0) * wind;
				wy = sin(x*0.02 + t*1.24) * wind;
			}

			//touch
			var tfx = 0, tfy = 0;
			if (touch) {
				var dxmouse = x - Mouse.x;
				var dymouse = y - Mouse.y;
				var dmouse = Math.sqrt(dxmouse*dxmouse + dymouse*dymouse);
				var force = 1-Math.min(1,dmouse/80);
				if (force > 0) {
					tfx = mouseForceX*force + Math.random()*2 - 1;
					tfy = mouseForceY*force + Math.random()*2 - 1;
				}
			}

			//integrate acceleration
			particles[i+3] = particles[i+3] * friction - gx*cgravity + wx + tfx;
			particles[i+4] = particles[i+4] * friction + gravity - gy*cgravity + wy + tfy;

			//bounds check
			if (x<0 || y<0 || x>w || y>h) {
				if (wrap) {
					if (x<0) x=w+x;
					if (y<0) y=h+y;
					if (x>w) x=x-w;
					if (y>h) y=y-h;
					particles[i+1] = x;
					particles[i+2] = y;
				}
				else {
					particles[i+0] = 0;
					continue;
				}
			}

			//draw
			var idx = (~~y)*w+(~~x);
			var cidx = ~~(i*4/nProps);
			var r,g,b,a;

			if (blending) {
				var bidx = idx*4;
				r = Math.min(255, (pColors[cidx+0] >>> 2) + pColorsBuffer[bidx+0]);
				g = Math.min(255, (pColors[cidx+1] >>> 2) + pColorsBuffer[bidx+1]);
				b = Math.min(255, (pColors[cidx+2] >>> 2) + pColorsBuffer[bidx+2]);
				a = Math.min(255, (pColors[cidx+3] >>> 2) + pColorsBuffer[bidx+3]);
				pColorsBuffer[bidx+0] = r;
				pColorsBuffer[bidx+1] = g;
				pColorsBuffer[bidx+2] = b;
				pColorsBuffer[bidx+3] = a;
			}
			else {
				r = pColors[cidx+0];
				g = pColors[cidx+1];
				b = pColors[cidx+2];
				a = pColors[cidx+3];
			}
			buffer32[idx] = (a<<24)|(b<<16)|(g<<8)|(r);
		}
		Flow.idata.data.set(Flow.buffer8);
		Flow.ctx.putImageData(Flow.idata, 0, 0);
		
		Flow.octx.drawImage(Flow.canvas, 0, 0);

		//fps display
		var fpsstr = "FPS: "+(1000/Flow.frameTime).toFixed(1);
		Flow.octx.fillStyle = "black";
		Flow.octx.fillRect(8,8,Flow.octx.measureText(fpsstr).width,16);
		Flow.octx.fillStyle = "white";
		Flow.octx.font = "12px monospace";
		Flow.octx.textAlign = "left";
		Flow.octx.textBaseline = "top";
		Flow.octx.fillText(fpsstr, 8, 12);

		requestAnimationFrame(Flow.draw);
	},

	resetColors: function() {
		for (var i=0,j=Flow.N; i<j; i++) {
			//HSL to RGB conversion
			var val = i/j;
			var sector = ~~(val*6);
			var z = ~~(255*(1-Math.abs((val/0.166)%2-1)));
			var r=0,g=0,b=0,a=255;
			switch (sector) {
				case 0:
					r = 255;
					g = z;
				break;
				case 1:
					r = z;
					g = 255;
				break;
				case 2:
					g = 255;
					b = z;
				break;
				case 3:
					g = z;
					b = 255;
				break;
				case 4:
					r = z;
					b = 255;
				break;
				case 5:
					r = 255;
					b = z;
				break;
			}

			//pack
			Flow.pColors[i*4] = r;
			Flow.pColors[i*4+1] = g;
			Flow.pColors[i*4+2] = b;
			Flow.pColors[i*4+3] = a;
		}
	},

	fromImage: function(url) {
		console.log(url);
		Flow.settings.gravity = 0;
		Flow.settings.wind = 0;
		Flow.settings.interactMode = "push";

		var img = new Image();
		img.onload = function(){
			var temp = document.createElement("canvas");
			var size = Math.floor(Math.sqrt(Flow.N));
			temp.width = size;
			temp.height = size;

			var tctx = temp.getContext("2d");
			tctx.drawImage(img, 0, 0, temp.width, temp.height);
			var idata = tctx.getImageData(0,0,temp.width,temp.height);
			var data = idata.data;
			
			var particles = Flow.particles, pColors = Flow.pColors, nProps = Flow.nProps;
			var offsetX = Math.floor(Flow.w*0.5 - temp.width*0.5);
			var offsetY = Math.floor(Flow.h*0.5 - temp.height*0.5);
			var i = 0;
			for (var x=0; x<temp.width; x++) {
				for (var y=0; y<temp.height; y++) {
					particles[i*nProps] = 1;
					particles[i*nProps+1] = x + offsetX;
					particles[i*nProps+2] = y + offsetY;
					particles[i*nProps+3] = 0;
					particles[i*nProps+4] = 0;

					var srcIdx = (x*temp.width+y)*4;
					pColors[i*4+0] = data[srcIdx+0];
					pColors[i*4+1] = data[srcIdx+1];
					pColors[i*4+2] = data[srcIdx+2];
					pColors[i*4+3] = data[srcIdx+3];
					i++;
				}
			}
		};
		img.src = url;
	}
};

var FastMath = {
	//borrowed from https://gist.github.com/going-digital/4320041
	//faster than some other approximations, much faster than LUT
	sin: function(x) {
		//mod 2pi
		x*=0.159155;
		x-=~~x;

		//black magic
		var xx=x*x;
		var y=-6.87897;
		y=y*xx+33.7755;
		y=y*xx-72.5257;
		y=y*xx+80.5874;
		y=y*xx-41.2408;
		y=y*xx+6.28077;
		return x*y;
	}
};

var Mouse = {x:0, y:0};
Flow.init();