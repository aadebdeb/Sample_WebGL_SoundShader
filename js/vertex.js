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

  function createTransformFeedbackProgram(gl, vertexShaderSource, fragmentShaderSource, varyings) {
    const program = gl.createProgram();
    gl.attachShader(program, createShader(gl, vertexShaderSource, gl.VERTEX_SHADER));
    gl.attachShader(program, createShader(gl, fragmentShaderSource, gl.FRAGMENT_SHADER));
    gl.transformFeedbackVaryings(program, varyings, gl.SEPARATE_ATTRIBS);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program));
    }
    return program;
  }

  function getUniformLocations(gl, program, keys) {
    const locations = {};
    keys.forEach(key => {
        locations[key] = gl.getUniformLocation(program, key);
    });
    return locations;
  }  

  function createVbo(gl, array, usage) {
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, array, usage !== undefined ? usage : gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    return vbo;
  }

  const VERTEX_SHADER =
`#version 300 es

out vec2 o_sound;

uniform float u_blockOffset;
uniform float u_sampleRate;

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
  float time = u_blockOffset + float(gl_VertexID) / u_sampleRate;
  o_sound = mainSound(time);
}
`;

  const FRAGMENT_SHADER =
`#version 300 es
void main(void) {}
`

  function createAudio() {
    const DURATION = 180; // seconds
    const SAMPLES = 65536;

    const audioCtx = new AudioContext();
    const audioBuffer = audioCtx.createBuffer(2, audioCtx.sampleRate * DURATION, audioCtx.sampleRate);

    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
  
    const program = createTransformFeedbackProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER, ['o_sound']);
    const uniforms = getUniformLocations(gl, program, ['u_sampleRate', 'u_blockOffset']);

    const array = new Float32Array(2 * SAMPLES);
    const vbo = createVbo(gl, array, gl.DYNAMIC_COPY);
    const transformFeedback = gl.createTransformFeedback();

    const numBlocks = (audioCtx.sampleRate * DURATION) / SAMPLES;
    const outputL = audioBuffer.getChannelData(0);
    const outputR = audioBuffer.getChannelData(1);

    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, transformFeedback);
    gl.enable(gl.RASTERIZER_DISCARD);
    gl.useProgram(program);
    gl.uniform1f(uniforms['u_sampleRate'], audioCtx.sampleRate);
    for (let i = 0; i < numBlocks; i++) {
      gl.uniform1f(uniforms['u_blockOffset'], i * SAMPLES / audioCtx.sampleRate);
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, vbo);
      gl.beginTransformFeedback(gl.POINTS);
      gl.drawArrays(gl.POINTS, 0, SAMPLES);
      gl.endTransformFeedback();
      gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER, 0, array);

      for (let j = 0; j < SAMPLES; j++) {
        outputL[i * SAMPLES + j] = array[j * 2];
        outputR[i * SAMPLES + j] = array[j * 2 + 1];
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