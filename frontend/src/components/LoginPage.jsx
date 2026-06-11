import { useState, useEffect, useRef } from 'react';

function LoginPage({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const containerRef = useRef(null);
  const physicsCanvasRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!username.trim() || !password.trim()) {
      setError('Both username and password are required.');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (response.ok) {
        const data = await response.json();
        onLoginSuccess(data.token, data);
      } else {
        const data = await response.json();
        setError(data?.detail || 'Authentication failed. Please check credentials.');
      }
    } catch (err) {
      setError('Connection failed: Authentication server unreachable.');
    } finally {
      setLoading(false);
    }
  };

  // WebGL Shader Background Logic & Parallax Mouse Move Effect
  useEffect(() => {
    const canvas = document.getElementById('shader-canvas-ANIMATION_8');
    if (!canvas) return;
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return;

    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      gl.viewport(0, 0, width, height);
    };
    window.addEventListener('resize', handleResize);

    const vsSrc = `
      attribute vec2 a_position;
      varying vec2 v_texCoord;
      void main() {
        v_texCoord = a_position * 0.5 + 0.5;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    const fsSrc = `
      precision highp float;
      varying vec2 v_texCoord;
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform vec2 u_mouse;

      float hash(vec2 p) {
          return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
      }

      float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      void main() {
          vec2 uv = v_texCoord;
          vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
          vec2 p = uv * aspect;
          vec2 mouse = (u_mouse / u_resolution) * aspect;
          
          vec3 color = vec3(0.04, 0.04, 0.05);
          vec3 accent = vec3(0.22, 1.0, 0.08);
          
          vec2 gridUv = uv * 30.0;
          gridUv.x += u_time * 0.2; 
          float gridLine = smoothstep(0.95, 1.0, sin(gridUv.x)) + smoothstep(0.95, 1.0, sin(gridUv.y));
          color += gridLine * accent * 0.04;

          float line = abs(uv.y - 0.5 + 0.2 * sin(uv.x * 3.0 + u_time * 0.5));
          line = smoothstep(0.005, 0.0, line);
          color += line * accent * 0.1;

          float n = noise(p * 8.0 + u_time * 0.1);
          if (n > 0.98) {
              float spark = smoothstep(0.98, 1.0, n);
              color += accent * spark * 0.3;
          }

          float scan = sin(uv.y * 600.0) * 0.03;
          color -= scan;

          float dist = distance(p, mouse);
          float mouseGlow = smoothstep(0.3, 0.0, dist);
          color += mouseGlow * accent * 0.1;

          float vignette = 1.0 - length(uv - 0.5) * 0.8;
          color *= vignette;

          gl_FragColor = vec4(color, 1.0);
      }
    `;

    const compileShader = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };

    const prog = gl.createProgram();
    gl.attachShader(prog, compileShader(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(prog, compileShader(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    const pos = gl.getAttribLocation(prog, 'a_position');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, 'u_time');
    const uRes = gl.getUniformLocation(prog, 'u_resolution');
    const uMouse = gl.getUniformLocation(prog, 'u_mouse');

    let mouse = { x: width / 2, y: height / 2 };
    const handleMouseMove = (event) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width && rect.height) {
        const nx = (event.clientX - rect.left) / rect.width;
        const ny = 1.0 - (event.clientY - rect.top) / rect.height;
        mouse.x = nx * width;
        mouse.y = ny * height;
      }
    };
    window.addEventListener('mousemove', handleMouseMove);

    let animationFrameId;
    const render = (t) => {
      if (!canvas) return;
      gl.viewport(0, 0, canvas.width, canvas.height);
      if (uTime) gl.uniform1f(uTime, t * 0.001);
      if (uRes) gl.uniform2f(uRes, canvas.width, canvas.height);
      if (uMouse) gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      animationFrameId = requestAnimationFrame(render);
    };
    render(0);

    // Dynamic mouse parallax for the monolith card
    const handleCardParallax = (e) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 10;
      const y = (e.clientY / window.innerHeight - 0.5) * 10;
      const monolith = containerRef.current;
      if (monolith) {
        monolith.style.transform = `translate3d(${x}px, ${y}px, 0) rotateX(${y * -0.5}deg) rotateY(${x * 0.5}deg)`;
      }
    };
    window.addEventListener('mousemove', handleCardParallax);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousemove', handleCardParallax);
    };
  }, []);

  // Holographic Suzuka Circuit Pulse Tracer Logic
  useEffect(() => {
    const canvas = physicsCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = canvas.width = canvas.offsetWidth;
    let height = canvas.height = canvas.offsetHeight;

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.offsetWidth;
      height = canvas.height = canvas.offsetHeight;
    };

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    if (canvas.parentNode) {
      resizeObserver.observe(canvas.parentNode);
    }

    // Coordinates tracing Spa-Francorchamps Circuit (user-provided path geometry)
    const trackPoints = [
      { rx: 0.1200, ry: 0.7006, label: 'START/FINISH', isCheckpoint: true },
      { rx: 0.1201, ry: 0.7010, isCheckpoint: false },
      { rx: 0.1202, ry: 0.7018, isCheckpoint: false },
      { rx: 0.1203, ry: 0.7021, isCheckpoint: false },
      { rx: 0.1206, ry: 0.7028, isCheckpoint: false },
      { rx: 0.1209, ry: 0.7034, isCheckpoint: false },
      { rx: 0.1211, ry: 0.7037, isCheckpoint: false },
      { rx: 0.1216, ry: 0.7043, isCheckpoint: false },
      { rx: 0.1221, ry: 0.7048, isCheckpoint: false },
      { rx: 0.1224, ry: 0.7051, isCheckpoint: false },
      { rx: 0.1236, ry: 0.7061, isCheckpoint: false },
      { rx: 0.1258, ry: 0.7070, isCheckpoint: false },
      { rx: 0.1273, ry: 0.7068, isCheckpoint: false },
      { rx: 0.1319, ry: 0.7049, isCheckpoint: false },
      { rx: 0.1396, ry: 0.7003, isCheckpoint: false },
      { rx: 0.1450, ry: 0.6968, isCheckpoint: false },
      { rx: 0.1595, ry: 0.6868, isCheckpoint: false },
      { rx: 0.1800, ry: 0.6723, isCheckpoint: false },
      { rx: 0.1929, ry: 0.6631, isCheckpoint: false },
      { rx: 0.2106, ry: 0.6505, isCheckpoint: false },
      { rx: 0.2167, ry: 0.6461, label: 'LA SOURCE', isCheckpoint: true },
      { rx: 0.2199, ry: 0.6439, isCheckpoint: false },
      { rx: 0.2264, ry: 0.6392, isCheckpoint: false },
      { rx: 0.2329, ry: 0.6346, isCheckpoint: false },
      { rx: 0.2361, ry: 0.6323, isCheckpoint: false },
      { rx: 0.2422, ry: 0.6279, isCheckpoint: false },
      { rx: 0.2451, ry: 0.6259, isCheckpoint: false },
      { rx: 0.2503, ry: 0.6222, isCheckpoint: false },
      { rx: 0.2548, ry: 0.6190, isCheckpoint: false },
      { rx: 0.2571, ry: 0.6173, isCheckpoint: false },
      { rx: 0.2619, ry: 0.6138, isCheckpoint: false },
      { rx: 0.2669, ry: 0.6102, isCheckpoint: false },
      { rx: 0.2695, ry: 0.6084, isCheckpoint: false },
      { rx: 0.2744, ry: 0.6047, isCheckpoint: false },
      { rx: 0.2790, ry: 0.6013, isCheckpoint: false },
      { rx: 0.2812, ry: 0.5997, isCheckpoint: false },
      { rx: 0.2851, ry: 0.5967, isCheckpoint: false },
      { rx: 0.2901, ry: 0.5930, isCheckpoint: false },
      { rx: 0.2929, ry: 0.5909, isCheckpoint: false },
      { rx: 0.2976, ry: 0.5877, isCheckpoint: false },
      { rx: 0.3011, ry: 0.5858, isCheckpoint: false },
      { rx: 0.3024, ry: 0.5854, isCheckpoint: false },
      { rx: 0.3044, ry: 0.5855, isCheckpoint: false },
      { rx: 0.3057, ry: 0.5870, isCheckpoint: false },
      { rx: 0.3062, ry: 0.5883, isCheckpoint: false },
      { rx: 0.3069, ry: 0.5917, label: 'EAU ROUGE', isCheckpoint: true },
      { rx: 0.3073, ry: 0.5955, isCheckpoint: false },
      { rx: 0.3076, ry: 0.5970, isCheckpoint: false },
      { rx: 0.3082, ry: 0.5997, isCheckpoint: false },
      { rx: 0.3091, ry: 0.6020, isCheckpoint: false },
      { rx: 0.3096, ry: 0.6030, isCheckpoint: false },
      { rx: 0.3107, ry: 0.6046, isCheckpoint: false },
      { rx: 0.3114, ry: 0.6052, isCheckpoint: false },
      { rx: 0.3128, ry: 0.6060, isCheckpoint: false },
      { rx: 0.3143, ry: 0.6064, isCheckpoint: false },
      { rx: 0.3151, ry: 0.6064, label: 'RAIDILLON', isCheckpoint: true },
      { rx: 0.3196, ry: 0.6057, isCheckpoint: false },
      { rx: 0.3285, ry: 0.6041, isCheckpoint: false },
      { rx: 0.3341, ry: 0.6032, isCheckpoint: false },
      { rx: 0.3468, ry: 0.6009, isCheckpoint: false },
      { rx: 0.3599, ry: 0.5985, isCheckpoint: false },
      { rx: 0.3662, ry: 0.5974, isCheckpoint: false },
      { rx: 0.3772, ry: 0.5953, isCheckpoint: false },
      { rx: 0.3849, ry: 0.5939, isCheckpoint: false },
      { rx: 0.3869, ry: 0.5935, isCheckpoint: false },
      { rx: 0.3922, ry: 0.5921, isCheckpoint: false },
      { rx: 0.3983, ry: 0.5900, isCheckpoint: false },
      { rx: 0.4018, ry: 0.5887, isCheckpoint: false },
      { rx: 0.4099, ry: 0.5855, isCheckpoint: false },
      { rx: 0.4196, ry: 0.5813, isCheckpoint: false },
      { rx: 0.4251, ry: 0.5788, isCheckpoint: false },
      { rx: 0.4377, ry: 0.5730, isCheckpoint: false },
      { rx: 0.4526, ry: 0.5659, isCheckpoint: false },
      { rx: 0.4610, ry: 0.5618, isCheckpoint: false },
      { rx: 0.4784, ry: 0.5535, isCheckpoint: false },
      { rx: 0.4916, ry: 0.5475, isCheckpoint: false },
      { rx: 0.4969, ry: 0.5454, isCheckpoint: false },
      { rx: 0.5059, ry: 0.5425, isCheckpoint: false },
      { rx: 0.5099, ry: 0.5418, isCheckpoint: false },
      { rx: 0.5174, ry: 0.5417, isCheckpoint: false },
      { rx: 0.5255, ry: 0.5431, label: 'KEMMEL STRAIGHT', isCheckpoint: true },
      { rx: 0.5300, ry: 0.5443, isCheckpoint: false },
      { rx: 0.5410, ry: 0.5476, isCheckpoint: false },
      { rx: 0.5650, ry: 0.5552, isCheckpoint: false },
      { rx: 0.5750, ry: 0.5588, isCheckpoint: false },
      { rx: 0.5921, ry: 0.5660, isCheckpoint: false },
      { rx: 0.6060, ry: 0.5740, isCheckpoint: false },
      { rx: 0.6122, ry: 0.5786, isCheckpoint: false },
      { rx: 0.6238, ry: 0.5896, isCheckpoint: false },
      { rx: 0.6354, ry: 0.6037, isCheckpoint: false },
      { rx: 0.6415, ry: 0.6122, isCheckpoint: false },
      { rx: 0.6553, ry: 0.6327, isCheckpoint: false },
      { rx: 0.6708, ry: 0.6549, isCheckpoint: false },
      { rx: 0.6787, ry: 0.6649, isCheckpoint: false },
      { rx: 0.6947, ry: 0.6831, isCheckpoint: false },
      { rx: 0.7111, ry: 0.6987, isCheckpoint: false },
      { rx: 0.7194, ry: 0.7056, isCheckpoint: false },
      { rx: 0.7365, ry: 0.7174, isCheckpoint: false },
      { rx: 0.7541, ry: 0.7268, isCheckpoint: false },
      { rx: 0.7632, ry: 0.7306, isCheckpoint: false },
      { rx: 0.7817, ry: 0.7364, isCheckpoint: false },
      { rx: 0.7886, ry: 0.7380, isCheckpoint: false },
      { rx: 0.8007, ry: 0.7400, isCheckpoint: false },
      { rx: 0.8106, ry: 0.7402, isCheckpoint: false },
      { rx: 0.8150, ry: 0.7396, isCheckpoint: false },
      { rx: 0.8230, ry: 0.7366, isCheckpoint: false },
      { rx: 0.8302, ry: 0.7313, isCheckpoint: false },
      { rx: 0.8338, ry: 0.7276, isCheckpoint: false },
      { rx: 0.8410, ry: 0.7181, isCheckpoint: false },
      { rx: 0.8490, ry: 0.7056, isCheckpoint: false },
      { rx: 0.8532, ry: 0.6986, label: 'LES COMBES', isCheckpoint: true },
      { rx: 0.8596, ry: 0.6866, isCheckpoint: false },
      { rx: 0.8635, ry: 0.6771, isCheckpoint: false },
      { rx: 0.8644, ry: 0.6731, isCheckpoint: false },
      { rx: 0.8641, ry: 0.6662, isCheckpoint: false },
      { rx: 0.8611, ry: 0.6604, isCheckpoint: false },
      { rx: 0.8585, ry: 0.6577, isCheckpoint: false },
      { rx: 0.8511, ry: 0.6525, isCheckpoint: false },
      { rx: 0.8406, ry: 0.6470, isCheckpoint: false },
      { rx: 0.8285, ry: 0.6411, isCheckpoint: false },
      { rx: 0.8090, ry: 0.6316, isCheckpoint: false },
      { rx: 0.7951, ry: 0.6244, isCheckpoint: false },
      { rx: 0.7900, ry: 0.6215, isCheckpoint: false },
      { rx: 0.7826, ry: 0.6166, isCheckpoint: false },
      { rx: 0.7784, ry: 0.6123, isCheckpoint: false },
      { rx: 0.7772, ry: 0.6102, isCheckpoint: false },
      { rx: 0.7758, ry: 0.6055, isCheckpoint: false },
      { rx: 0.7754, ry: 0.6027, isCheckpoint: false },
      { rx: 0.7750, ry: 0.5983, isCheckpoint: false },
      { rx: 0.7748, ry: 0.5958, isCheckpoint: false },
      { rx: 0.7748, ry: 0.5948, label: 'MALMEDY', isCheckpoint: true },
      { rx: 0.7749, ry: 0.5928, isCheckpoint: false },
      { rx: 0.7752, ry: 0.5910, isCheckpoint: false },
      { rx: 0.7754, ry: 0.5902, isCheckpoint: false },
      { rx: 0.7761, ry: 0.5885, isCheckpoint: false },
      { rx: 0.7769, ry: 0.5867, isCheckpoint: false },
      { rx: 0.7775, ry: 0.5857, isCheckpoint: false },
      { rx: 0.7796, ry: 0.5822, isCheckpoint: false },
      { rx: 0.7819, ry: 0.5772, isCheckpoint: false },
      { rx: 0.7828, ry: 0.5747, isCheckpoint: false },
      { rx: 0.7840, ry: 0.5699, isCheckpoint: false },
      { rx: 0.7843, ry: 0.5652, isCheckpoint: false },
      { rx: 0.7842, ry: 0.5628, isCheckpoint: false },
      { rx: 0.7834, ry: 0.5582, isCheckpoint: false },
      { rx: 0.7818, ry: 0.5535, isCheckpoint: false },
      { rx: 0.7807, ry: 0.5511, isCheckpoint: false },
      { rx: 0.7781, ry: 0.5468, isCheckpoint: false },
      { rx: 0.7755, ry: 0.5433, isCheckpoint: false },
      { rx: 0.7740, ry: 0.5418, isCheckpoint: false },
      { rx: 0.7697, ry: 0.5389, isCheckpoint: false },
      { rx: 0.7631, ry: 0.5359, label: 'RIVAGE', isCheckpoint: true },
      { rx: 0.7586, ry: 0.5343, isCheckpoint: false },
      { rx: 0.7466, ry: 0.5305, isCheckpoint: false },
      { rx: 0.7389, ry: 0.5281, isCheckpoint: false },
      { rx: 0.7195, ry: 0.5225, isCheckpoint: false },
      { rx: 0.6910, ry: 0.5143, isCheckpoint: false },
      { rx: 0.6765, ry: 0.5100, isCheckpoint: false },
      { rx: 0.6530, ry: 0.5022, isCheckpoint: false },
      { rx: 0.6360, ry: 0.4949, isCheckpoint: false },
      { rx: 0.6296, ry: 0.4911, isCheckpoint: false },
      { rx: 0.6202, ry: 0.4831, isCheckpoint: false },
      { rx: 0.6146, ry: 0.4735, isCheckpoint: false },
      { rx: 0.6128, ry: 0.4678, isCheckpoint: false },
      { rx: 0.6108, ry: 0.4544, isCheckpoint: false },
      { rx: 0.6099, ry: 0.4399, isCheckpoint: false },
      { rx: 0.6098, ry: 0.4341, label: 'BRUXELLES', isCheckpoint: true },
      { rx: 0.6107, ry: 0.4242, isCheckpoint: false },
      { rx: 0.6133, ry: 0.4163, isCheckpoint: false },
      { rx: 0.6152, ry: 0.4130, isCheckpoint: false },
      { rx: 0.6209, ry: 0.4073, isCheckpoint: false },
      { rx: 0.6291, ry: 0.4025, isCheckpoint: false },
      { rx: 0.6343, ry: 0.4002, isCheckpoint: false },
      { rx: 0.6471, ry: 0.3959, isCheckpoint: false },
      { rx: 0.6663, ry: 0.3904, isCheckpoint: false },
      { rx: 0.6769, ry: 0.3873, isCheckpoint: false },
      { rx: 0.6954, ry: 0.3819, isCheckpoint: false },
      { rx: 0.7035, ry: 0.3794, isCheckpoint: false },
      { rx: 0.7180, ry: 0.3748, isCheckpoint: false },
      { rx: 0.7307, ry: 0.3704, isCheckpoint: false },
      { rx: 0.7365, ry: 0.3683, isCheckpoint: false },
      { rx: 0.7478, ry: 0.3639, isCheckpoint: false },
      { rx: 0.7590, ry: 0.3592, isCheckpoint: false },
      { rx: 0.7647, ry: 0.3566, isCheckpoint: false },
      { rx: 0.7793, ry: 0.3501, isCheckpoint: false },
      { rx: 0.7902, ry: 0.3457, isCheckpoint: false },
      { rx: 0.7945, ry: 0.3444, label: 'POUHON', isCheckpoint: true },
      { rx: 0.8015, ry: 0.3435, isCheckpoint: false },
      { rx: 0.8072, ry: 0.3450, isCheckpoint: false },
      { rx: 0.8099, ry: 0.3468, isCheckpoint: false },
      { rx: 0.8154, ry: 0.3524, isCheckpoint: false },
      { rx: 0.8219, ry: 0.3609, isCheckpoint: false },
      { rx: 0.8259, ry: 0.3662, isCheckpoint: false },
      { rx: 0.8350, ry: 0.3774, isCheckpoint: false },
      { rx: 0.8437, ry: 0.3858, isCheckpoint: false },
      { rx: 0.8478, ry: 0.3890, isCheckpoint: false },
      { rx: 0.8555, ry: 0.3932, isCheckpoint: false },
      { rx: 0.8625, ry: 0.3945, isCheckpoint: false },
      { rx: 0.8657, ry: 0.3941, isCheckpoint: false },
      { rx: 0.8714, ry: 0.3912, isCheckpoint: false },
      { rx: 0.8761, ry: 0.3853, isCheckpoint: false },
      { rx: 0.8781, ry: 0.3813, isCheckpoint: false },
      { rx: 0.8796, ry: 0.3768, isCheckpoint: false },
      { rx: 0.8800, ry: 0.3747, isCheckpoint: false },
      { rx: 0.8796, ry: 0.3703, isCheckpoint: false },
      { rx: 0.8775, ry: 0.3649, isCheckpoint: false },
      { rx: 0.8756, ry: 0.3617, isCheckpoint: false },
      { rx: 0.8698, ry: 0.3535, isCheckpoint: false },
      { rx: 0.8612, ry: 0.3426, isCheckpoint: false },
      { rx: 0.8557, ry: 0.3358, isCheckpoint: false },
      { rx: 0.8418, ry: 0.3192, isCheckpoint: false },
      { rx: 0.8240, ry: 0.2980, isCheckpoint: false },
      { rx: 0.8169, ry: 0.2897, isCheckpoint: false },
      { rx: 0.8055, ry: 0.2772, isCheckpoint: false },
      { rx: 0.7968, ry: 0.2695, isCheckpoint: false },
      { rx: 0.7930, ry: 0.2673, isCheckpoint: false },
      { rx: 0.7856, ry: 0.2654, label: 'CAMPUS', isCheckpoint: true },
      { rx: 0.7776, ry: 0.2665, isCheckpoint: false },
      { rx: 0.7729, ry: 0.2678, isCheckpoint: false },
      { rx: 0.7613, ry: 0.2717, isCheckpoint: false },
      { rx: 0.7521, ry: 0.2747, isCheckpoint: false },
      { rx: 0.7482, ry: 0.2759, isCheckpoint: false },
      { rx: 0.7418, ry: 0.2773, isCheckpoint: false },
      { rx: 0.7369, ry: 0.2778, isCheckpoint: false },
      { rx: 0.7348, ry: 0.2776, isCheckpoint: false },
      { rx: 0.7311, ry: 0.2763, isCheckpoint: false },
      { rx: 0.7278, ry: 0.2739, isCheckpoint: false },
      { rx: 0.7262, ry: 0.2723, isCheckpoint: false },
      { rx: 0.7227, ry: 0.2681, isCheckpoint: false },
      { rx: 0.7216, ry: 0.2668, isCheckpoint: false },
      { rx: 0.7194, ry: 0.2645, isCheckpoint: false },
      { rx: 0.7172, ry: 0.2627, isCheckpoint: false },
      { rx: 0.7160, ry: 0.2620, isCheckpoint: false },
      { rx: 0.7136, ry: 0.2608, isCheckpoint: false },
      { rx: 0.7110, ry: 0.2601, isCheckpoint: false },
      { rx: 0.7096, ry: 0.2598, isCheckpoint: false },
      { rx: 0.7066, ry: 0.2597, isCheckpoint: false },
      { rx: 0.7034, ry: 0.2598, isCheckpoint: false },
      { rx: 0.7021, ry: 0.2600, isCheckpoint: false },
      { rx: 0.6988, ry: 0.2608, isCheckpoint: false },
      { rx: 0.6933, ry: 0.2626, isCheckpoint: false },
      { rx: 0.6894, ry: 0.2641, label: 'STAVELOT', isCheckpoint: true },
      { rx: 0.6784, ry: 0.2682, isCheckpoint: false },
      { rx: 0.6622, ry: 0.2746, isCheckpoint: false },
      { rx: 0.6518, ry: 0.2787, isCheckpoint: false },
      { rx: 0.6257, ry: 0.2892, isCheckpoint: false },
      { rx: 0.5913, ry: 0.3029, isCheckpoint: false },
      { rx: 0.5588, ry: 0.3160, isCheckpoint: false },
      { rx: 0.5064, ry: 0.3371, isCheckpoint: false },
      { rx: 0.4686, ry: 0.3526, isCheckpoint: false },
      { rx: 0.4541, ry: 0.3587, isCheckpoint: false },
      { rx: 0.4324, ry: 0.3683, isCheckpoint: false },
      { rx: 0.4244, ry: 0.3723, isCheckpoint: false },
      { rx: 0.4121, ry: 0.3792, isCheckpoint: false },
      { rx: 0.4024, ry: 0.3859, isCheckpoint: false },
      { rx: 0.3975, ry: 0.3897, isCheckpoint: false },
      { rx: 0.3830, ry: 0.4012, isCheckpoint: false },
      { rx: 0.3666, ry: 0.4140, isCheckpoint: false },
      { rx: 0.3592, ry: 0.4196, isCheckpoint: false },
      { rx: 0.3463, ry: 0.4292, isCheckpoint: false },
      { rx: 0.3354, ry: 0.4368, isCheckpoint: false },
      { rx: 0.3307, ry: 0.4400, isCheckpoint: false },
      { rx: 0.3225, ry: 0.4449, isCheckpoint: false },
      { rx: 0.3159, ry: 0.4483, isCheckpoint: false },
      { rx: 0.3132, ry: 0.4494, isCheckpoint: false },
      { rx: 0.3054, ry: 0.4517, isCheckpoint: false },
      { rx: 0.2960, ry: 0.4547, label: 'BLANCHIMONT', isCheckpoint: true },
      { rx: 0.2920, ry: 0.4563, isCheckpoint: false },
      { rx: 0.2848, ry: 0.4597, isCheckpoint: false },
      { rx: 0.2789, ry: 0.4636, isCheckpoint: false },
      { rx: 0.2763, ry: 0.4658, isCheckpoint: false },
      { rx: 0.2717, ry: 0.4708, isCheckpoint: false },
      { rx: 0.2678, ry: 0.4767, isCheckpoint: false },
      { rx: 0.2659, ry: 0.4800, isCheckpoint: false },
      { rx: 0.2630, ry: 0.4862, isCheckpoint: false },
      { rx: 0.2601, ry: 0.4913, isCheckpoint: false },
      { rx: 0.2584, ry: 0.4940, isCheckpoint: false },
      { rx: 0.2541, ry: 0.4998, isCheckpoint: false },
      { rx: 0.2515, ry: 0.5030, isCheckpoint: false },
      { rx: 0.2451, ry: 0.5103, isCheckpoint: false },
      { rx: 0.2369, ry: 0.5192, isCheckpoint: false },
      { rx: 0.2320, ry: 0.5243, isCheckpoint: false },
      { rx: 0.2203, ry: 0.5362, isCheckpoint: false },
      { rx: 0.2041, ry: 0.5526, isCheckpoint: false },
      { rx: 0.1955, ry: 0.5615, isCheckpoint: false },
      { rx: 0.1809, ry: 0.5774, isCheckpoint: false },
      { rx: 0.1690, ry: 0.5918, label: 'BUS STOP CHICANE', isCheckpoint: true },
      { rx: 0.1638, ry: 0.5988, isCheckpoint: false },
      { rx: 0.1548, ry: 0.6127, isCheckpoint: false },
      { rx: 0.1468, ry: 0.6275, isCheckpoint: false },
      { rx: 0.1431, ry: 0.6356, isCheckpoint: false },
      { rx: 0.1355, ry: 0.6536, isCheckpoint: false },
      { rx: 0.1298, ry: 0.6683, isCheckpoint: false },
      { rx: 0.1283, ry: 0.6723, isCheckpoint: false },
      { rx: 0.1256, ry: 0.6794, isCheckpoint: false },
      { rx: 0.1235, ry: 0.6853, isCheckpoint: false },
      { rx: 0.1227, ry: 0.6879, isCheckpoint: false },
      { rx: 0.1214, ry: 0.6922, isCheckpoint: false },
      { rx: 0.1205, ry: 0.6957, isCheckpoint: false },
      { rx: 0.1202, ry: 0.6971, isCheckpoint: false },
      { rx: 0.1200, ry: 0.6996, isCheckpoint: false }
    ];

    // Map the pre-evaluated SVG path coordinates directly to canvas scale
    const generatePath = (pointsList) => {
      const size = Math.min(width, height);
      return pointsList.map(pt => ({
        x: (pt.rx - 0.5) * size + width / 2,
        y: (pt.ry - 0.5) * size + height / 2
      }));
    };

    let path = generatePath(trackPoints);

    // Re-generate path on resize
    const handlePathResize = () => {
      handleResize();
      path = generatePath(trackPoints);
    };

    window.addEventListener('resize', handlePathResize);
    
    // Pulse entities (comets lapping the circuit)
    const pulses = [
      { progress: 0.0, speed: 0.22, color: 'rgba(57, 255, 20', colorHex: '#39ff14', size: 3.5 },
      { progress: 133.0, speed: 0.18, color: 'rgba(0, 240, 255', colorHex: '#00f0ff', size: 3.0 },
      { progress: 266.0, speed: 0.25, color: 'rgba(255, 57, 163', colorHex: '#ff39a3', size: 4.0 }
    ];

    let animFrame;
    const trailLength = 30;

    const renderLoop = () => {
      ctx.clearRect(0, 0, width, height);

      // 1. Draw a faint background holographic coordinate grid
      ctx.save();
      ctx.strokeStyle = 'rgba(57, 255, 20, 0.015)';
      ctx.lineWidth = 1;
      const gridSize = 50;
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0); ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y); ctx.lineTo(width, y);
        ctx.stroke();
      }
      ctx.restore();

      // Helper to draw a track outline path
      const drawTrack = (trackPath, isOverpass = false, isClosed = false) => {
        if (trackPath.length < 2) return;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(trackPath[0].x, trackPath[0].y);
        for (let i = 1; i < trackPath.length; i++) {
          ctx.lineTo(trackPath[i].x, trackPath[i].y);
        }
        if (isClosed) {
          ctx.closePath();
        }

        if (isOverpass) {
          // Blackout mask to hide the underpass loop beneath the bridge deck
          ctx.strokeStyle = '#050507';
          ctx.lineWidth = 16; // Thinned to 16px (was 20px)
          ctx.stroke();
        }

        // Track background asphalt ribbon
        ctx.strokeStyle = 'rgba(57, 255, 20, 0.04)';
        ctx.lineWidth = 14; // Thinned to 14px (was 18px)
        ctx.stroke();

        // Track curbs borders
        ctx.strokeStyle = 'rgba(57, 255, 20, 0.1)';
        ctx.lineWidth = 8; // Thinned to 8px (was 10px)
        ctx.stroke();

        // Fine neon green centerline
        ctx.strokeStyle = 'rgba(57, 255, 20, 0.45)';
        ctx.lineWidth = 1.2; // Thinned to 1.2px (was 1.5px)
        ctx.stroke();
        ctx.restore();
      };

      // Update progress for all pulses along the single path
      pulses.forEach(pulse => {
        pulse.progress = (pulse.progress + pulse.speed) % path.length;
      });

      // Layer 1: Track Outline (closed loop)
      drawTrack(path, false, true);

      // Layer 2: Comets & Trails (running along the unified track)
      pulses.forEach(pulse => {
        const currentIdx = Math.floor(pulse.progress);

        // Draw fading comet trail
        for (let idx = 0; idx < trailLength; idx++) {
          const pathIdx = (currentIdx - idx + path.length) % path.length;
          const pt = path[pathIdx];
          if (!pt) continue;
          const alpha = (1 - idx / trailLength) * 0.75;
          ctx.fillStyle = `${pulse.color}, ${alpha})`;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, pulse.size * (1 - idx / trailLength) + 0.8, 0, Math.PI * 2);
          ctx.fill();
        }

        // Draw glowing head particle
        const headPt = path[currentIdx];
        if (headPt) {
          ctx.save();
          ctx.shadowColor = pulse.colorHex;
          ctx.shadowBlur = 8;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(headPt.x, headPt.y, pulse.size + 0.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      });

      // 5. Draw static turn HUD labels on top of everything
      ctx.save();
      ctx.fillStyle = 'rgba(57, 255, 20, 0.3)';
      ctx.font = '7px monospace';
      const size = Math.min(width, height);
      trackPoints.forEach(pt => {
        if (pt.isCheckpoint) {
          const px = (pt.rx - 0.5) * size + width / 2;
          const py = (pt.ry - 0.5) * size + height / 2;
          ctx.fillText(`[ ${pt.label} ]`, px + 8, py + 3);
          
          // Little crosshair mark for turns
          ctx.strokeStyle = 'rgba(57, 255, 20, 0.25)';
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(px - 4, py);
          ctx.lineTo(px + 4, py);
          ctx.moveTo(px, py - 4);
          ctx.lineTo(px, py + 4);
          ctx.stroke();
        }
      });
      ctx.restore();

      // HUD overlay label
      ctx.fillStyle = 'rgba(57, 255, 20, 0.25)';
      ctx.font = '8px monospace';
      ctx.fillText('TACTICAL TELEMETRY: SPA-FRANCORCHAMPS CIRCUIT SPLINE', 15, 20);

      animFrame = requestAnimationFrame(renderLoop);
    };

    renderLoop();

    return () => {
      cancelAnimationFrame(animFrame);
      resizeObserver.disconnect();
      window.removeEventListener('resize', handlePathResize);
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black h-full w-full overflow-hidden font-body-md text-white z-50 select-none">
      {/* 1. Custom CSS Styles defined locally in JSX */}
      <style>{`
        .glass-card {
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(57, 255, 20, 0.3);
          border-bottom: 3px solid #39ff14;
        }
        
        .industrial-input {
          background: rgba(10, 10, 12, 0.9);
          border: 1px solid rgba(255, 255, 255, 0.1);
          transition: all 0.2s ease-in-out;
        }
        
        .industrial-input:focus {
          border-color: #39ff14;
          box-shadow: 0 0 10px rgba(57, 255, 20, 0.2);
          outline: none;
        }

        .btn-neon {
          transition: all 0.3s ease;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .btn-neon:hover {
          box-shadow: 0 0 25px rgba(57, 255, 20, 0.8);
          transform: translateY(-1px);
        }

        .btn-neon:active {
          transform: translateY(0);
        }

        .small-caps {
          font-variant: small-caps;
        }

        /* 3D Grid Styles - Massive Scale */
        .scene-container {
          perspective: 1000px;
          perspective-origin: 50% 40%;
        }

        .grid-floor {
          position: absolute;
          bottom: -10vh;
          left: -50vw;
          width: 200vw;
          height: 70vh;
          transform-origin: top center;
          transform: rotateX(75deg);
          background-image: 
            linear-gradient(90deg, rgba(57, 255, 20, 0.12) 2px, transparent 2px),
            linear-gradient(0deg, rgba(57, 255, 20, 0.12) 2px, transparent 2px);
          background-size: 60px 60px;
          background-position: center bottom;
          box-shadow: inset 0 200px 100px -50px #000;
          animation: grid-move 2.5s linear infinite;
        }

        .horizon-glow {
          position: absolute;
          top: 35%;
          left: 0;
          width: 100%;
          height: 100px;
          background: linear-gradient(to bottom, transparent, rgba(57, 255, 20, 0.12), transparent);
          filter: blur(40px);
          pointer-events: none;
          z-index: 5;
        }

        .grid-fade {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: linear-gradient(to bottom, #000 0%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.9) 100%);
          pointer-events: none;
        }

        @keyframes grid-move {
          0% { background-position: center 0; }
          100% { background-position: center 60px; }
        }

        /* Data Streams */
        .stream {
          position: absolute;
          bottom: 0;
          width: 4px;
          height: 150px;
          background: #39ff14;
          box-shadow: 0 0 15px #39ff14, 0 0 30px #39ff14;
          opacity: 0;
          animation: stream-flow linear infinite;
          border-radius: 2px;
        }

        @keyframes stream-flow {
          0% { transform: translateY(100%) scaleY(1); opacity: 0; }
          10% { opacity: 1; }
          80% { opacity: 1; }
          100% { transform: translateY(-600px) scaleY(0.2); opacity: 0; }
        }

        /* Monolith Float Animation */
        .monolith-wrapper {
          transform-style: preserve-3d;
          transform: translateZ(0);
          animation: float-parallax 8s ease-in-out infinite;
        }

        @keyframes float-parallax {
          0%, 100% { transform: translateY(0) rotateX(0deg) rotateY(0deg); }
          25% { transform: translateY(-15px) rotateX(1deg) rotateY(1deg); }
          50% { transform: translateY(-5px) rotateX(-1deg) rotateY(-1deg); }
          75% { transform: translateY(-12px) rotateX(0.5deg) rotateY(-0.5deg); }
        }

        /* HUD Elements */
        .hud-scanline {
          position: fixed;
          inset: 0;
          background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.08) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.015), rgba(0, 255, 0, 0.008), rgba(0, 0, 255, 0.015));
          background-size: 100% 4px, 3px 100%;
          pointer-events: none;
          z-index: 50;
          opacity: 0.25;
        }

        .corner-bracket {
          position: fixed;
          width: 40px;
          height: 40px;
          border-color: rgba(57, 255, 20, 0.25);
          border-style: solid;
          border-width: 0;
          pointer-events: none;
          z-index: 50;
        }

        /* Particle Sparks */
        .particles-container {
          position: absolute;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
        }
        
        .spark {
          position: absolute;
          width: 2px;
          height: 2px;
          background: #fff;
          border-radius: 50%;
          box-shadow: 0 0 5px #39ff14;
          animation: spark-drift linear infinite;
        }

        @keyframes spark-drift {
          0% { transform: translate(0, 0) scale(1); opacity: 0; }
          20% { opacity: 0.6; }
          80% { opacity: 0.6; }
          100% { transform: translate(var(--tw-translate-x), var(--tw-translate-y)) scale(0); opacity: 0; }
        }
      `}</style>

      {/* HUD Overlays */}
      <div className="hud-scanline"></div>
      <div className="corner-bracket top-10 left-10 border-t border-l"></div>
      <div className="corner-bracket top-10 right-10 border-t border-r"></div>
      <div className="corner-bracket bottom-10 left-10 border-b border-l"></div>
      <div className="corner-bracket bottom-10 right-10 border-b border-r"></div>

      {/* WebGL Background Shader Canvas */}
      <div className="fixed inset-0 w-full h-full z-0 pointer-events-none">
        <canvas id="shader-canvas-ANIMATION_8" className="block w-full h-full" />
      </div>

      {/* Horizon Glow */}
      <div className="horizon-glow"></div>

      {/* 3D Scene Container */}
      <div className="scene-container absolute inset-0 w-full h-full z-10 pt-10">
        <div className="grid-floor pointer-events-none">
          <div className="grid-fade"></div>
          <div className="stream" style={{ left: '40%', animationDuration: '1.5s', animationDelay: '0s' }}></div>
          <div className="stream" style={{ left: '50%', animationDuration: '2s', animationDelay: '0.5s' }}></div>
          <div className="stream" style={{ left: '60%', animationDuration: '1.2s', animationDelay: '0.2s' }}></div>
          <div className="stream" style={{ left: '45%', animationDuration: '1.8s', animationDelay: '0.8s' }}></div>
          <div className="stream" style={{ left: '55%', animationDuration: '1.6s', animationDelay: '0.3s' }}></div>
          <div className="stream" style={{ left: '35%', animationDuration: '2.2s', animationDelay: '1.1s' }}></div>
          <div className="stream" style={{ left: '65%', animationDuration: '1.9s', animationDelay: '0.7s' }}></div>
        </div>
        
        <div className="particles-container">
          <div className="spark" style={{ top: '20%', left: '30%', '--tw-translate-x': '-50px', '--tw-translate-y': '-100px', animationDuration: '4s', animationDelay: '0s' }}></div>
          <div className="spark" style={{ top: '60%', left: '70%', '--tw-translate-x': '100px', '--tw-translate-y': '-150px', animationDuration: '5s', animationDelay: '1s' }}></div>
          <div className="spark" style={{ top: '80%', left: '40%', '--tw-translate-x': '-80px', '--tw-translate-y': '-200px', animationDuration: '3.5s', animationDelay: '2s' }}></div>
        </div>

        {/* Split Layout Container */}
        <div className="absolute inset-0 flex flex-col md:flex-row items-center justify-center md:justify-between px-6 md:px-16 lg:px-24 py-16 gap-8 md:gap-12 overflow-y-auto md:overflow-hidden pt-24 md:pt-10 pointer-events-none">
          
          {/* Left Column: Monolith Card */}
          <div className="w-full md:w-[45%] lg:w-[40%] flex justify-center items-center pointer-events-auto">
            <main ref={containerRef} className="monolith-wrapper w-full max-w-md transition-transform duration-75 ease-out">
              <div className="glass-card rounded-lg p-8 shadow-monolith relative overflow-hidden bg-industrial-dark bg-opacity-80">
                <div className="absolute top-0 left-0 w-full h-[1.5px] bg-gradient-to-r from-transparent via-neon-green to-transparent opacity-50"></div>
                
                <div className="text-center mb-8">
                  <h1 className="text-2xl font-display-mono font-bold text-white tracking-widest uppercase mb-2">Race Control</h1>
                  <p className="text-neon-green text-xs font-display-mono tracking-widest small-caps">Secure Checkpoint</p>
                </div>

                {error && (
                  <div className="p-sm mb-4 border border-red-500/30 bg-red-500/5 text-red-400 text-xs flex items-center gap-sm animate-fadeIn font-display-mono">
                    <span className="material-symbols-outlined text-sm">error</span>
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label className="block text-xs font-display-mono text-gray-400 mb-2 uppercase tracking-wider">Operator ID</label>
                    <input 
                      className="industrial-input w-full px-4 py-3 text-white font-display-mono rounded placeholder-gray-700 focus:ring-1 focus:ring-neon-green text-sm" 
                      placeholder="ENTER ID..." 
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-display-mono text-gray-400 mb-2 uppercase tracking-wider">Access Code</label>
                    <input 
                      className="industrial-input w-full px-4 py-3 text-white font-display-mono rounded placeholder-gray-700 focus:ring-1 focus:ring-neon-green text-sm" 
                      placeholder="••••••••" 
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={loading}
                    />
                  </div>

                  <div className="pt-4">
                    <button 
                      type="submit"
                      disabled={loading}
                      className="btn-neon w-full bg-neon-green bg-opacity-20 text-neon-green border border-neon-green font-display-mono font-bold py-3 rounded hover:bg-opacity-35 focus:outline-none focus:ring-2 focus:ring-neon-green focus:ring-opacity-50 flex justify-center items-center gap-sm disabled:opacity-50"
                    >
                      {loading ? (
                        <>
                          <span className="animate-spin material-symbols-outlined text-sm">sync</span>
                          VERIFYING CONNECTION...
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-sm">lock_open</span>
                          Initialize Connection
                        </>
                      )}
                    </button>

                    <div className="mt-6 pt-6 border-t border-white border-opacity-10 font-display-mono text-xs uppercase tracking-widest">
                      <div className="flex justify-between mb-2">
                        <span className="text-gray-500">Operator ID:</span>
                        <span className="text-white font-bold normal-case select-text cursor-text">chief_steward</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Access Code:</span>
                        <span className="text-white font-bold normal-case select-text cursor-text">racecontrol2026</span>
                      </div>
                    </div>
                  </div>
                </form>

                <div className="mt-8 text-center flex items-center justify-center">
                  <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse mr-2"></span>
                  <span className="text-xs font-display-mono text-gray-500 uppercase tracking-widest">System Locked</span>
                </div>
              </div>
            </main>
          </div>

          {/* Right Column: Draggable Node Web Canvas */}
          <div className="w-full md:w-[55%] lg:w-[60%] h-[400px] md:h-full flex items-center justify-center relative pointer-events-auto">
            <div className="w-full h-full max-h-[500px] md:max-h-[600px] relative overflow-hidden bg-transparent">
              <canvas ref={physicsCanvasRef} className="w-full h-full block" />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default LoginPage;
