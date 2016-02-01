function onLoad() {
  // Setup three.js WebGL renderer. Note: Antialiasing is a big performance hit.
  // Only enable it if you actually need to.
  pyserver.log('creating WebGLRenderer...');
  var renderer = new THREE.WebGLRenderer(); //{antialias: true});
  pyserver.log('windows.devicePixelRatio = ' + window.devicePixelRatio);
  renderer.setPixelRatio(window.devicePixelRatio);

  // Append the canvas element created by the renderer to document body element.
  document.body.appendChild(renderer.domElement);


  var stats = new WebVRStats();
  stats.setMode( 0 ); // 0: fps, 1: ms, 2: mb
  stats.domElement.style.position = 'absolute';
  stats.domElement.style.left = '0px';
  stats.domElement.style.top = '0px';
  document.body.appendChild( stats.domElement );


  // Create a three.js scene.
  var scene = new THREE.Scene();

  // Create a three.js camera.
  var camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);


  if (navigator.getVRDevices) {
    navigator.getVRDevices()
    .then( function (devices) {
      for (var i = 0; i < devices.length; i++) {
        var device = devices[i];
        pyserver.log('VR device ' + i + ': ' + device.deviceName);
      }
    });
  }


  // Apply VR headset positional data to camera.
  var controls = new THREE.VRControls(camera, function (error) { pyserver.log(error); });

  // Apply VR stereo rendering to renderer.
  var effect = new THREE.VREffect(renderer, function (error) { pyserver.log(error); });
  effect.setSize(window.innerWidth, window.innerHeight);


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
  pyserver.log('creating WebVRManager...');
  pyserver.log('params:\n' + JSON.stringify(params, undefined, 2));
  var manager = new WebVRManager(renderer, effect, params);


  // Create 3D objects.

  var objectLoader = new THREE.ObjectLoader();
  objectLoader.load('vrDesk.json', function (object) {
    scene.add(object);
    object.scale.set(0.01, 0.01, 0.01);
    object.position.z -= 1.41;
    object.position.y -= 0.83;
  }, undefined, function (err) {
    console.log('vrDesk.json could not be loaded: ' + err);
  });


  // Request animation frame loop function
  var lastRender = 0;
  function animate(timestamp) {

    stats.begin();

    var delta = Math.min(timestamp - lastRender, 500);
    lastRender = timestamp;

    // Update VR headset position and apply to camera.
    controls.update();

    // Render the scene through the manager.
    manager.render(scene, camera, timestamp);

    stats.end();

    requestAnimationFrame(animate);
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
