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
		friction: 0.0
	},

	init: function() {
		document.title = (""+Flow.N).replace(/(\d{3})(?!$)/g,"$1,")+" particles";
		
		Flow.particles = new Float32Array(Flow.N * Flow.nProps);
		
		//precalculate colors for each particle
		Flow.pColors = new Int32Array(Flow.N);
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
			Flow.pColors[i] = Flow.color(r,g,b,a);
		}

		//DOM
		Flow.output = document.getElementById("info");
		Flow.canvas = document.getElementById("display");
		Flow.canvas.width = Flow.canvas.style.width = Flow.w;
		Flow.canvas.height = Flow.canvas.style.height = Flow.h;
		document.addEventListener("mousemove", function(event){
			Mouse.x = Math.min(Flow.w, Math.max(0, event.pageX - Flow.canvas.offsetLeft));
			Mouse.y = Math.min(Flow.h, Math.max(0, event.pageY - Flow.canvas.offsetTop));
		}, false);

		//dat.gui
		var gui = new dat.GUI();
		var phys = gui.addFolder("Physics");
		phys.add(Flow.settings, "gravity").min(0).max(1).step(0.05);
		phys.add(Flow.settings, "centerGravity").min(0).max(1).step(0.05);
		phys.add(Flow.settings, "wind").min(0).max(1).step(0.05);
		phys.add(Flow.settings, "friction").min(0).max(1).step(0.05);

		//image data buffers
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
		var pps = 20;
		dx /= steps;
		dy /= steps;
		var posX = Mouse.px,
			posY = Mouse.py;
		if (len > 0)
		for (var j=0; j<steps; j++) {
			for (var k=0; k<pps; k++) {
				Flow.insertIdx = (Flow.insertIdx+1)%Flow.N;
				var idx = Flow.insertIdx*Flow.nProps;
				Flow.particles[idx+0] = 1;
				Flow.particles[idx+1] = posX+dx*j;
				Flow.particles[idx+2] = posY+dy*j;

				var dir2 = dir + Math.random()*0.5-0.25;
				var len2 = (Math.random()*0.5+0.5)*len*4;
				Flow.particles[idx+3] = Math.cos(dir2)*len2 + Math.random()*2 - 1;
				Flow.particles[idx+4] = Math.sin(dir2)*len2 + Math.random()*2 - 1;
			}
		}
		Mouse.px = Mouse.x;
		Mouse.py = Mouse.y;

		//clear to background color
		var bcol = Flow.color(13,11,10,255);
		for (var i=0,j=Flow.w*Flow.h; i<j; i++) {
			Flow.buffer32[i] = bcol;
		}

		//there is a slight performance penalty for accessing properties;
		//it's better to only do this once.
		var particles = Flow.particles;
		var gravity = Flow.settings.gravity;
		var cgravity = Flow.settings.centerGravity;
		var wind = Flow.settings.wind;
		var friction = 1-Flow.settings.friction;
		var sin = FastMath.sin;
		var buffer32 = Flow.buffer32, pColors = Flow.pColors, nProps = Flow.nProps;

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

			//integrate acceleration
			particles[i+3] = particles[i+3] * friction - gx*cgravity + wx;
			particles[i+4] = particles[i+4] * friction + gravity - gy*cgravity + wy;

			//bounds check
			if (x<0 || y<0 || x>Flow.w || y>Flow.h) {
				Flow.particles[i+0] = 0;
				continue;
			}

			//draw
			var idx = (~~y)*w+(~~x);
			buffer32[idx] = pColors[~~(i/nProps)];
		}
		Flow.idata.data.set(Flow.buffer8);
		Flow.ctx.putImageData(Flow.idata, 0, 0);
		
		//fps display
		Flow.ctx.fillStyle = "white";
		Flow.ctx.font = "12px monospace";
		Flow.ctx.fillText("FPS: "+(1000/Flow.frameTime).toFixed(1), 8, 12);

		requestAnimationFrame(Flow.draw);
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