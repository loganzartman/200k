var Flow = {
	w: Math.floor(window.innerWidth/2),
	h: Math.floor(window.innerHeight/2),
	N: 128000,
	nProps: 5,
	t0: Date.now(),
	insertIdx: 0,

	settings: {
		gravity: 0.5,
		friction: 0.0
	},

	init: function() {
		document.title = (""+Flow.N).replace(/(\d{3})(?!$)/g,"$1,")+" particles";
		Flow.particles = new Float32Array(Flow.N * Flow.nProps);
		Flow.pColors = new Uint8Array(Flow.N * 4);
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
			Flow.pColors[i*4] = r;
			Flow.pColors[i*4+1] = g;
			Flow.pColors[i*4+2] = b;
			Flow.pColors[i*4+3] = a;
		}

		Flow.output = document.getElementById("info");
		Flow.canvas = document.getElementById("display");
		Flow.canvas.width = Flow.w;
		Flow.canvas.height = Flow.h;

		document.addEventListener("mousemove", function(event){
			Mouse.px = Mouse.x;
			Mouse.py = Mouse.y;
			Mouse.x = Math.min(Flow.w, Math.max(0, event.pageX * (Flow.w/window.innerWidth)));
			Mouse.y = Math.min(Flow.h, Math.max(0, event.pageY * (Flow.h/window.innerHeight)));
		}, false);

		var gui = new dat.GUI();
		var phys = gui.addFolder("Physics");
		phys.add(Flow.settings, "gravity").min(-2).max(2).step(0.05);
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

		var bcol = Flow.color(0,0,0,255);
		for (var i=0,j=Flow.w*Flow.h; i<j; i++) {
			Flow.buffer32[i] = bcol;
		}

		var cx = Flow.w*0.5, cy = Flow.h*0.5;
		var particles = Flow.particles;
		var gravity = Flow.settings.gravity;
		var friction = 1-Flow.settings.friction;
		for (i=0,j=particles.length; i<j; i+=Flow.nProps) {
			if (particles[i+0] === 0) continue;
			particles[i+1] += particles[i+3];
			particles[i+2] += particles[i+4];
			var x = particles[i+1];
			var y = particles[i+2];

			//gravity
			var ox = x - cx, oy = y - cy;
			var dist = Math.sqrt(ox*ox+oy*oy);
			ox /= dist;
			oy /= dist;
			particles[i+3] = particles[i+3] * friction;
			particles[i+4] = particles[i+4] * friction + gravity;

			//bounds
			if (x<0 || y<0 || x>Flow.w || y>Flow.h) {
				Flow.particles[i+0] = 0;
				continue;
			}

			//draw
			var cidx = ~~(i/Flow.nProps*4);
			var r = Flow.pColors[cidx+0];
			var g = Flow.pColors[cidx+1];
			var b = Flow.pColors[cidx+2];
			var a = Flow.pColors[cidx+3];

			var idx = (~~y)*Flow.w+(~~x);
			Flow.buffer32[idx] = (a<<24)|(b<<16)|(g<<8)|(r);
		}
		Flow.idata.data.set(Flow.buffer8);
		Flow.ctx.putImageData(Flow.idata, 0, 0);

		requestAnimationFrame(Flow.draw);
	}
};

var Mouse = {x:0, y:0};
Flow.init();