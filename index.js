function onLoad() {
  // Setup three.js WebGL renderer. Note: Antialiasing is a big performance hit.
  // Only enable it if you actually need to.
  var renderer = new THREE.WebGLRenderer(); //{antialias: true});
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);

  // Append the canvas element created by the renderer to document body element.
  document.body.appendChild(renderer.domElement);

  // var rS = new rStats();

  // Create a three.js scene.
  var scene = new THREE.Scene();

  // Create a three.js camera.
  var camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

  // Apply VR headset positional data to camera.
  var controls = new THREE.VRControls(camera, console.error);

  // Apply VR stereo rendering to renderer.
  var effect = new THREE.VREffect(renderer, console.error);

  // Add a repeating grid as a skybox.
  var boxWidth = 5;
  var loader = new THREE.TextureLoader();
  loader.load('img/box.png', onTextureLoaded);

  function onTextureLoaded(texture) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(boxWidth, boxWidth);

    var geometry = new THREE.BoxGeometry(boxWidth, boxWidth, boxWidth);
    var material = new THREE.MeshBasicMaterial({
      map: texture,
      color: 0x01BE00,
      side: THREE.BackSide
    });

    var skybox = new THREE.Mesh(geometry, material);
    scene.add(skybox);
  }

  // Create a VR manager helper to enter and exit VR mode.
  var params = {
    hideButton: false, // Default: false.
    isUndistorted: true // Default: false.
  };
  var manager = new WebVRManager(renderer, effect, params);

  // Create 3D objects.
  var objectLoader = new THREE.ObjectLoader();
  objectLoader.load('vrDesk.json', function (object) {
    scene.add(object);
    object.scale.set(0.01, 0.01, 0.01);
    object.position.z -= 1.41;
    object.position.y -= 0.7;
  }, undefined, function (err) {
    console.log('vrDesk.json could not be loaded: ' + err);
  });

  // Request animation frame loop function
  var lastRender = 0;
  function animate(timestamp) {
    // rS('frame').start();
    // rS('raF').tick();
    // rS('FPS').frame();

    var delta = Math.min(timestamp - lastRender, 500);
    lastRender = timestamp;

    // Update VR headset position and apply to camera.
    controls.update();

    // Render the scene through the manager.
    manager.render(scene, camera, timestamp);

    requestAnimationFrame(animate);

    // rS('frame').end();
    // rS().update();
  }

  // Kick off animation loop
  animate(performance ? performance.now() : Date.now());

  // Reset the position sensor when 'z' pressed.
  function onKey(event) {
    if (event.keyCode == 90) { // z
      controls.resetSensor();
    }
  }

  window.addEventListener('keydown', onKey, true);
}
