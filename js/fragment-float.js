(function() {

  function createShader(gl, source, type) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) + source);
    }
    return shader;
  }

  function createProgram(gl, vertexShader, fragmentShader) {
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program));
    }
    return program;
  }

  function createProgramFromSource(gl, vertexShaderSource, fragmentShaderSource) {
    const vertexShader = createShader(gl, vertexShaderSource, gl.VERTEX_SHADER);
    const fragmentShader = createShader(gl, fragmentShaderSource, gl.FRAGMENT_SHADER);
    return createProgram(gl, vertexShader, fragmentShader);
  }

  function getUniformLocations(gl, program, keys) {
    const locations = {};
    keys.forEach(key => {
        locations[key] = gl.getUniformLocation(program, key);
    });
    return locations;
  }  

  const VERTEX_SHADER =
`#version 300 es

const vec2[4] POSITIONS = vec2[](
  vec2(-1.0, -1.0),
  vec2(1.0, -1.0),
  vec2(-1.0, 1.0),
  vec2(1.0, 1.0)
);

const int[6] INDICES = int[](
  0, 1, 2,
  3, 2, 1
);

void main(void) {
  vec2 position = POSITIONS[INDICES[gl_VertexID]];
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

  const FRAGMENT_SHADER = 
`#version 300 es

precision highp float;

out vec2 o_sound;

uniform float u_sampleRate;
uniform float u_blockOffset;
uniform vec2 u_resolution;

#define BPM 120.0

float timeToBeat(float time) {
  return time / 60.0 * BPM;
}

float sine(float freq, float time) {
  return sin(freq * 6.28318530718 * time);
}

vec2 mainSound(float time) {
  float beat = timeToBeat(time);
  float freq = mod(beat, 4.0) >= 1.0 ? 440.0 : 880.0;
  float amp = exp(-6.0 * fract(beat));
  return vec2(sine(freq, time) * amp);
}

void main(void) {
  vec2 coord = floor(gl_FragCoord.xy);
  float time = u_blockOffset + (coord.x + coord.y * u_resolution.x) / u_sampleRate;
  o_sound = mainSound(time);
}
`;

  function createAudio() {
    const DURATION = 180; // seconds
    const WIDTH = 512;
    const HEIGHT = 512;

    const audioCtx = new AudioContext();
    const audioBuffer = audioCtx.createBuffer(2, audioCtx.sampleRate * DURATION, audioCtx.sampleRate);

    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const gl = canvas.getContext('webgl2');
    gl.getExtension('EXT_color_buffer_float');

    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, WIDTH, HEIGHT, 0, gl.RG, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    const program = createProgramFromSource(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    const uniforms = getUniformLocations(gl, program, ['u_sampleRate', 'u_blockOffset', 'u_resolution']);

    const samples = WIDTH * HEIGHT;
    const numBlocks = Math.ceil((audioCtx.sampleRate * DURATION) / samples);
    const pixels = new Float32Array(WIDTH * HEIGHT * 2);
    const outputDataL = audioBuffer.getChannelData(0);
    const outputDataR = audioBuffer.getChannelData(1);

    gl.useProgram(program);
    gl.uniform1f(uniforms['u_sampleRate'], audioCtx.sampleRate);
    gl.uniform2f(uniforms['u_resolution'], WIDTH, HEIGHT);
    for (let i = 0; i < numBlocks; i++) {
      gl.uniform1f(uniforms['u_blockOffset'], i * samples / audioCtx.sampleRate);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.readPixels(0, 0, WIDTH, HEIGHT, gl.RG, gl.FLOAT, pixels);

      for (let j = 0; j < samples; j++) {
        outputDataL[i * samples + j] = pixels[j * 2];
        outputDataR[i * samples + j] = pixels[j * 2 + 1];
      }
    }
  
    const node = audioCtx.createBufferSource();
    node.connect(audioCtx.destination);
    node.buffer = audioBuffer;
    node.loop = false;
    return node;
  }

  const startButton = document.getElementById('startButton');
  const elapsedTime = document.getElementById('elapsedTime')
  startButton.addEventListener('click', _ => {
    const startTime = performance.now();
    const node = createAudio();
    const endTime = performance.now();
    elapsedTime.textContent = `elapsed time: ${(endTime - startTime) * 0.001} s`;
    node.start(0);
  }, {once: true});

}());