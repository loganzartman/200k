var Flow = {
	w: Math.min(960, Math.floor(window.innerWidth/1)),
	h: Math.min(700, Math.floor(window.innerHeight/1)),
	N: 200000,
	nProps: 5,
	t0: Date.now(),
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
		Flow.pColors = new Int32Array(Flow.N);
		for (var i=0,j=Flow.N; i<j; i++) {
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
			Flow.pColors[i] = (a<<24)|(b<<16)|(g<<8)|(r);
		}

		Flow.output = document.getElementById("info");
		Flow.canvas = document.getElementById("display");
		Flow.canvas.width = Flow.canvas.style.width = Flow.w;
		Flow.canvas.height = Flow.canvas.style.height = Flow.h;

		document.addEventListener("mousemove", function(event){
			Mouse.x = Math.min(Flow.w, Math.max(0, event.pageX - Flow.canvas.offsetLeft));
			Mouse.y = Math.min(Flow.h, Math.max(0, event.pageY - Flow.canvas.offsetTop));
		}, false);

		var gui = new dat.GUI();
		var phys = gui.addFolder("Physics");
		phys.add(Flow.settings, "gravity").min(0).max(1).step(0.05);
		phys.add(Flow.settings, "centerGravity").min(0).max(1).step(0.05);
		phys.add(Flow.settings, "wind").min(0).max(1).step(0.05);
		phys.add(Flow.settings, "friction").min(0).max(1).step(0.05);

		Flow.ctx = Flow.canvas.getContext("2d");
		Flow.idata = Flow.ctx.getImageData(0,0,Flow.w,Flow.h);
		Flow.buffer = new ArrayBuffer(Flow.idata.data.length);
		Flow.buffer8 = new Uint8ClampedArray(Flow.buffer);
		Flow.buffer32 = new Uint32Array(Flow.buffer);
		Flow.draw();
	},

	color: function(r,g,b,a) {
		return (a<<24)|(b<<16)|(g<<8)|(r);
	},

	draw: function() {
		var w = Flow.canvas.width;
		var h = Flow.canvas.height;
		var t = (Date.now()-Flow.t0)/1000;

		Flow.ctx.fillStyle = "black";
		Flow.ctx.fillRect(0,0,w,h);

		var dx = Mouse.x - Mouse.px,
			dy = Mouse.y - Mouse.py;
		var len = Math.sqrt(dx*dx+dy*dy)/4;
		var dir = Math.atan2(dy,dx);
		var steps = 200;
		var pps = 10;
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
				var len2 = (Math.random()*0.5+0.5)*len;
				Flow.particles[idx+3] = Math.cos(dir2)*len2 + Math.random()*2 - 1;
				Flow.particles[idx+4] = Math.sin(dir2)*len2 + Math.random()*2 - 1;
			}
		}
		Mouse.px = Mouse.x;
		Mouse.py = Mouse.y;

		//clear
		var bcol = Flow.color(13,11,10,255);
		for (var i=0,j=Flow.w*Flow.h; i<j; i++) {
			Flow.buffer32[i] = bcol;
		}

		//step
		var cx = Flow.w*0.5, cy = Flow.h*0.5;
		var particles = Flow.particles;
		var gravity = Flow.settings.gravity;
		var cgravity = Flow.settings.centerGravity;
		var wind = Flow.settings.wind;
		var friction = 1-Flow.settings.friction;
		var sin = FastMath.sin;
		for (i=0,j=particles.length; i<j; i+=Flow.nProps) {
			if (particles[i+0] === 0) continue;
			particles[i+1] += particles[i+3];
			particles[i+2] += particles[i+4];
			var x = particles[i+1];
			var y = particles[i+2];

			//gravity
			var gx=0, gy=0;
			if (cgravity !== 0) {
				gx = x - cx;
				gy = y - cy;
				var dist = Math.sqrt(gx*gx+gy*gy);
				gx /= dist;
				gy /= dist;
			}
			
			//wind
			var wx=0, wy=0;
			if (wind !== 0) {
				wx = (sin(y*0.012 + t*1.24) * 2.5 + sin(y*0.028 + t*6.25) * 1.0) * wind;
				wy = sin(x*0.02 + t*1.24) * wind;
			}

			particles[i+3] = particles[i+3] * friction - gx*cgravity + wx;
			particles[i+4] = particles[i+4] * friction + gravity - gy*cgravity + wy;

			//bounds
			if (x<0 || y<0 || x>Flow.w || y>Flow.h) {
				Flow.particles[i+0] = 0;
				continue;
			}

			//draw
			var idx = (~~y)*Flow.w+(~~x);
			Flow.buffer32[idx] = Flow.pColors[~~(i/5)];
		}
		Flow.idata.data.set(Flow.buffer8);
		Flow.ctx.putImageData(Flow.idata, 0, 0);
		var tmp = Flow.occlusion;
		Flow.occlusion = Flow.occlusionWrite;
		Flow.occlusionWrite = tmp;

		requestAnimationFrame(Flow.draw);
	}
};

var FastMath = {
	sin: function(x) {
		x*=0.159155;
		x-=~~x;
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