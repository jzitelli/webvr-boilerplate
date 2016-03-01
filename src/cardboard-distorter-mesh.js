var Util = require('./util.js');

/**
 * A mesh-based distorter. Based on
 * https://github.com/mrdoob/three.js/blob/dev/examples/js/effects/CardboardEffect.js.
 *
 * Works as follows:
 * 1. Create a tesselated quad.
 * 2. Distort the quad.
 * 3. Use the distorted quad to render
 */
function CardboardDistorter(renderer) {
    this.renderer = renderer;
    this.genuineRender = renderer.render;
    this.genuineSetSize = renderer.setSize;
    this.genuineSetViewport = renderer.setViewport;
    this.genuineSetScissor = renderer.setScissor;

    // Camera, scene and geometry to render the scene to a texture.
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    var params = {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.NearestFilter,
        format: THREE.RGBAFormat
    };
    this.renderTarget = new THREE.WebGLRenderTarget(512, 512, params);
    this.renderTarget.scissorTest = true;

    //this.material = new THREE.MeshBasicMaterial({wireframe: true});
    this.material = new THREE.MeshBasicMaterial({map: this.renderTarget});
    //this.material = new THREE.MeshBasicMaterial({map: THREE.ImageUtils.loadTexture('img/UV_Grid_Sm.jpg')});
    this.scene = new THREE.Scene();

    var geometry = this.createWarpMeshGeometry_();
    this.updateGeometry_(geometry);
}


CardboardDistorter.prototype.patch = function() {
    if (!this.isActive) {
        return;
    }

    this.renderer.render = function(scene, camera, renderTarget, forceClear) {
        this.genuineRender.call(this.renderer, scene, camera, this.renderTarget, forceClear);
    }.bind(this);

    this.renderer.setSize = function(width, height) {
        this.renderTarget.setSize(width, height);
        this.genuineSetSize.call(this.renderer, width, height);
    }.bind(this);

    this.renderer.setScissor = function(x0, y0, width, height) {
        this.renderTarget.scissor.set(x0, y0, width, height);
    }.bind(this);

    this.renderer.setViewport = function(x0, y0, width, height) {
        this.renderTarget.viewport.set(x0, y0, width, height);
    }.bind(this);
};

CardboardDistorter.prototype.unpatch = function() {
    if (!this.isActive) {
        return;
    }
    this.renderer.render = this.genuineRender;
    this.renderer.setSize = this.genuineSetSize;
    this.renderer.setViewport = this.genuineSetViewport;
    this.renderer.setScissor = this.genuineSetScissor;
};


CardboardDistorter.prototype.preRender = function() {
    if (!this.isActive) {
        return;
    }
};


CardboardDistorter.prototype.postRender = function() {
    if (!this.isActive) {
        return;
    }
    this.genuineRender.call(this.renderer, this.scene, this.camera);
};


/**
 * Toggles distortion. This is called externally by the boilerplate.
 * It should be enabled only if WebVR is provided by polyfill.
 */
CardboardDistorter.prototype.setActive = function(state) {
    this.isActive = state;
};

/**
 * Called whenever the device info changes. At this point we need to
 * re-calculate the distortion mesh.
 */
CardboardDistorter.prototype.updateDeviceInfo = function(deviceInfo) {
    var geometry = this.createWarpMeshGeometry_(deviceInfo);
    this.updateGeometry_(geometry);
};

/**
 * Creates a warp mesh that is applied to the scene (which is rendered to a
 * texture).
 */
CardboardDistorter.prototype.createWarpMeshGeometry_ = function(deviceInfo) {
    // var distortion = new THREE.Vector2( 0.441, 0.156 );
    var distortion = new THREE.Vector2( 0.34, 0.55 );
    if (deviceInfo) distortion.fromArray(deviceInfo.viewer.distortionCoefficients);

    var geometry = new THREE.PlaneBufferGeometry( 1, 1, 10, 20 ).removeAttribute( 'normal' ).toNonIndexed();

    var positions = geometry.attributes.position.array;
    var uvs = geometry.attributes.uv.array;

    // duplicate
    var positions2 = new Float32Array( positions.length * 2 );
    positions2.set( positions );
    positions2.set( positions, positions.length );

    var uvs2 = new Float32Array( uvs.length * 2 );
    uvs2.set( uvs );
    uvs2.set( uvs, uvs.length );

    var vector = new THREE.Vector2();
    var length = positions.length / 3;

    for ( var i = 0, l = positions2.length / 3; i < l; i ++ ) {

        vector.x = positions2[ i * 3 + 0 ];
        vector.y = positions2[ i * 3 + 1 ];

        var dot = vector.dot( vector );
        var scalar = 1.5 + ( distortion.x + distortion.y * dot ) * dot;

        var offset = i < length ? 0 : 1;

        positions2[ i * 3 + 0 ] = ( vector.x / scalar ) * 1.5 - 0.5 + offset;
        positions2[ i * 3 + 1 ] = ( vector.y / scalar ) * 3.0;

        uvs2[ i * 2 ] = ( uvs2[ i * 2 ] + offset ) * 0.5;

    }

    geometry.attributes.position.array = positions2;
    geometry.attributes.uv.array = uvs2;

    return geometry;
};


CardboardDistorter.prototype.updateGeometry_ = function(geometry) {
    // Remove all objects from the scene.
    var scene = this.scene;
    scene.traverse(function(child) {
        scene.remove(child);
    });

    // Add this mesh to the scene.
    var mesh = new THREE.Mesh(geometry, this.material);
    this.scene.add(mesh);
};


/**
 * Given a vector in [0, 1], distort it
 *
 * @param {Vector2} vec
 * @param {Boolean} isLeft True iff it's the left eye. False otherwise.
 */
CardboardDistorter.prototype.distort_ = function(vector, isLeft) {
    /*
      var dot = vector.dot( vector );
      var scalar = 1.0 + ( this.distortion.x + this.distortion.y * dot ) * dot;
      vector.divideScalar(scalar);
      return vector;
    */

    var proj = isLeft ? this.projectionLeft : this.projectionRight;
    var unproj = isLeft ? this.unprojectionLeft : this.unprojectionRight;
    return this.barrel_(vector, proj, unproj, this.distortion);
};

/**
 * @param {THREE.Vector2} vec
 * @param {THREE.Vector4} projection
 * @param {THREE.Vector4} unprojection
 *
 * @return {THREE.Vector2} Barrel distorted version of vec.
 */
CardboardDistorter.prototype.barrel_ = function(vec, projection, unprojection, distortion) {
    // 'vec2 w = (v + unprojection.zw) / unprojection.xy;',
    var w = new THREE.Vector2();
    w.x = (vec.x + unprojection.z) / unprojection.x;
    w.y = (vec.y + unprojection.w) / unprojection.y;

    // 'return projection.xy * (poly(dot(w, w)) * w) - projection.zw;',
    var out = new THREE.Vector2();
    w.multiplyScalar(this.poly_(w.dot(w), distortion));
    out.x = projection.x * w.x - projection.z;
    out.y = projection.y * w.y - projection.w;

    return out;
};

/**
 * @return {Number} Polynomial output of the distorter.
 */
CardboardDistorter.prototype.poly_ = function(val, distortion) {
    if (this.showCenter && val < 0.001) {
        return 10000;
    }
    return 1.0 + (distortion.x + distortion.y * val) * val;
};


module.exports = CardboardDistorter;
