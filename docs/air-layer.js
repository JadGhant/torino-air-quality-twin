"use strict";

function makeAirLayer({ mesh, nx, ny, sheets = 7, opacity = 0.55, fadeNodes = 8 }) {
  const n = nx * ny;
  const sheetAlpha = 1 - Math.pow(1 - opacity, 1 / sheets);
  const colours = new Float32Array(n * 4);
  const edge = new Float32Array(n);
  for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) {
    const d = Math.min(r, c, ny - 1 - r, nx - 1 - c) / fadeNodes;
    edge[r * nx + c] = d >= 1 ? 1 : d * d * (3 - 2 * d);
  }
  let gl, prog, posBuf, colBuf, idxBuf, nIdx, idxType, dirty = true, mixingHeight = 30, mpm = 1;
  let ox = 0, oy = 0;
  const local = new Float32Array(16);

  const VS = `
    attribute vec3 a_pos; attribute vec4 a_col;
    uniform mat4 u_matrix; uniform float u_dz;
    varying vec4 v_col;
    void main() { gl_Position = u_matrix * vec4(a_pos.xy, a_pos.z + u_dz, 1.0); v_col = a_col; }`;
  const FS = `
    precision mediump float;
    varying vec4 v_col; uniform float u_alpha;
    void main() { float a = v_col.a * u_alpha; gl_FragColor = vec4(v_col.rgb * a, a); }`;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  const layer = {
    id: "air3d", type: "custom", renderingMode: "3d",

    onAdd(map, context) {
      gl = context;
      prog = gl.createProgram();
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      const pos = new Float32Array(n * 3);
      const mid = 3 * (Math.floor(ny / 2) * nx + Math.floor(nx / 2));
      const o = maplibregl.MercatorCoordinate.fromLngLat([mesh[mid], mesh[mid + 1]], 0);
      ox = o.x; oy = o.y;
      for (let i = 0; i < n; i++) {
        const m = maplibregl.MercatorCoordinate.fromLngLat([mesh[3 * i], mesh[3 * i + 1]], mesh[3 * i + 2]);
        pos[3 * i] = m.x - ox; pos[3 * i + 1] = m.y - oy; pos[3 * i + 2] = m.z;
        if (i === 0) mpm = m.meterInMercatorCoordinateUnits();
      }
      posBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
      colBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
      gl.bufferData(gl.ARRAY_BUFFER, colours, gl.DYNAMIC_DRAW);
      const big = n > 65535;
      if (big && !(typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext)) gl.getExtension("OES_element_index_uint");
      const idx = big ? new Uint32Array((nx - 1) * (ny - 1) * 6) : new Uint16Array((nx - 1) * (ny - 1) * 6);
      let k = 0;
      for (let r = 0; r < ny - 1; r++) for (let c = 0; c < nx - 1; c++) {
        const a = r * nx + c, b = a + 1, d = a + nx, e = d + 1;
        idx[k++] = a; idx[k++] = d; idx[k++] = b; idx[k++] = b; idx[k++] = d; idx[k++] = e;
      }
      nIdx = idx.length;
      idxType = big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
      idxBuf = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
      this.map = map;
    },

    render(context, options) {
      if (dirty) {
        gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, colours);
        dirty = false;
      }
      gl.useProgram(prog);
      const matrix = (options.defaultProjectionData && options.defaultProjectionData.mainMatrix) || options.modelViewProjectionMatrix;
      for (let i = 0; i < 12; i++) local[i] = matrix[i];
      for (let i = 0; i < 4; i++) local[12 + i] = matrix[i] * ox + matrix[4 + i] * oy + matrix[12 + i];
      gl.uniformMatrix4fv(gl.getUniformLocation(prog, "u_matrix"), false, local);
      gl.uniform1f(gl.getUniformLocation(prog, "u_alpha"), sheetAlpha);
      const aPos = gl.getAttribLocation(prog, "a_pos"), aCol = gl.getAttribLocation(prog, "a_col");
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
      gl.enableVertexAttribArray(aCol);
      gl.vertexAttribPointer(aCol, 4, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      const dz = gl.getUniformLocation(prog, "u_dz");
      for (let s = sheets; s >= 1; s--) {
        gl.uniform1f(dz, Math.max(4, mixingHeight) * (0.3 + 0.7 * (s - 1) / (sheets - 1)) * mpm);
        gl.drawElements(gl.TRIANGLES, nIdx, idxType, 0);
      }
      gl.disableVertexAttribArray(aPos);
      gl.disableVertexAttribArray(aCol);
    },

    setValues(values, colourOf) {
      for (let i = 0; i < n; i++) {
        const [r, g, b] = colourOf(values[i]);
        colours[4 * i] = r / 255; colours[4 * i + 1] = g / 255; colours[4 * i + 2] = b / 255; colours[4 * i + 3] = edge[i];
      }
      dirty = true;
      if (this.map) this.map.triggerRepaint();
    },

    setMixingHeight(h) {
      mixingHeight = h;
      if (this.map) this.map.triggerRepaint();
    },
  };
  return layer;
}
