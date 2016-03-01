/*
 * Copyright 2015 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var ButtonManager = require('./button-manager.js');
var DeviceInfo = require('./device-info.js');
var Emitter = require('./emitter.js');
var Modes = require('./modes.js');
var RotateInstructions = require('./rotate-instructions.js');
var Util = require('./util.js');
var ViewerSelector = require('./viewer-selector.js');

/**
 * Helper for getting in and out of VR mode.
 * Here we assume VR mode == full screen mode.
 *
 * 1. Detects whether or not VR mode is possible by feature detecting for
 * WebVR (or polyfill).
 *
 * 2. If WebVR is available, shows a button that lets you enter VR mode.
 */
function WebVRManager(renderer, effect, params) {
  this.params = params || {};

  this.mode = Modes.UNKNOWN;

  // Set option to hide the button.
  this.hideButton = this.params.hideButton || false;

  // Save the THREE.js renderer and effect for later.
  this.renderer = renderer;
  this.effect = effect;
  this.button = new ButtonManager();
  this.rotateInstructions = new RotateInstructions();
  this.viewerSelector = new ViewerSelector(DeviceInfo.Viewers);

  this.isVRCompatible = false;
  this.isFullscreenDisabled = !!Util.getQueryParameter('no_fullscreen');
  this.startMode = Modes.NORMAL;
  var startModeParam = parseInt(Util.getQueryParameter('start_mode'));
  if (!isNaN(startModeParam)) {
    this.startMode = startModeParam;
  }

  // Set the correct viewer profile, but only if this is Cardboard.
  if (Util.isMobile()) {
    this.onViewerChanged_(this.getViewer());
  }
  // Listen for changes to the viewer.
  this.viewerSelector.on('change', this.onViewerChanged_.bind(this));

  if (this.hideButton) {
    this.button.setVisibility(false);
  }

  this.button.on('fs', this.onFSClick_.bind(this));
  this.button.on('back', this.onBackClick_.bind(this));
  this.button.on('settings', this.onSettingsClick_.bind(this));

  // Check there is any HMD provided by WebVR.
  navigator.getVRDisplays().then(function (displays) {
    if (displays) {

      this.isVRCompatible = true;

      // Set the right mode.
      switch (this.startMode) {
        case Modes.MAGIC_WINDOW:
          this.normalToMagicWindow_();
          this.setMode_(Modes.MAGIC_WINDOW);
          break;
        case Modes.VR:
          this.anyModeToVR_();
          this.setMode_(Modes.VR);
          break;
        default:
          this.setMode_(Modes.NORMAL);
      }

      this.button.on('vr', this.onVRClick_.bind(this));
      this.emit('initialized');
    }
  }.bind(this));

  // Whenever we enter fullscreen, we are entering VR or immersive mode.
  document.addEventListener('webkitfullscreenchange', this.onFullscreenChange_.bind(this));
  document.addEventListener('mozfullscreenchange',    this.onFullscreenChange_.bind(this));
  if (Util.isMobile()) {
    window.addEventListener('orientationchange', this.onOrientationChange_.bind(this));
  }
}

WebVRManager.prototype = new Emitter();

// Expose these values externally.
WebVRManager.Modes = Modes;

WebVRManager.prototype.isVRMode = function() {
  return this.mode === Modes.VR;
};

WebVRManager.prototype.setMode_ = function(mode) {
  var oldMode = this.mode;
  if (mode === this.mode) {
    console.error('Not changing modes, already in %s', mode);
    return;
  }
  console.log('Mode change: %s => %s', this.mode, mode);
  this.mode = mode;
  this.button.setMode(mode, this.isVRCompatible);

  if (this.mode === Modes.VR && Util.isLandscapeMode() && Util.isMobile()) {
    // In landscape mode, temporarily show the "put into Cardboard"
    // interstitial. Otherwise, do the default thing.
    this.rotateInstructions.showTemporarily(3000);
  } else {
    this.updateRotateInstructions_();
  }

  // Also hide the viewer selector.
  this.viewerSelector.hide();

  // Emit an event indicating the mode changed.
  this.emit('modechange', mode, oldMode);

};

/**
 * Main button was clicked.
 */
WebVRManager.prototype.onFSClick_ = function() {
  switch (this.mode) {
    case Modes.NORMAL:
      // TODO: Remove this hack when iOS has fullscreen mode.
      // If this is an iframe on iOS, break out and open in no_fullscreen mode.
      if (Util.isIOS() && Util.isIFrame()) {
        var url = window.location.href;
        url = Util.appendQueryParameter(url, 'no_fullscreen', 'true');
        url = Util.appendQueryParameter(url, 'start_mode', Modes.MAGIC_WINDOW);
        top.location.href = url;
        return;
      }
      this.normalToMagicWindow_();
      this.setMode_(Modes.MAGIC_WINDOW);
      break;
    case Modes.MAGIC_WINDOW:
      if (this.isFullscreenDisabled) {
        window.history.back();
      } else {
        this.anyModeToNormal_();
        this.setMode_(Modes.NORMAL);
      }
      break;
  }
};

/**
 * The VR button was clicked.
 */
WebVRManager.prototype.onVRClick_ = function() {
  // TODO: Remove this hack when iOS has fullscreen mode.
  // If this is an iframe on iOS, break out and open in no_fullscreen mode.
  if (this.mode === Modes.NORMAL && Util.isIOS() && Util.isIFrame()) {
    var url = window.location.href;
    url = Util.appendQueryParameter(url, 'no_fullscreen', 'true');
    url = Util.appendQueryParameter(url, 'start_mode', Modes.VR);
    top.location.href = url;
    return;
  }
  this.anyModeToVR_();
  this.setMode_(Modes.VR);
};

/**
 * Back button was clicked.
 */
WebVRManager.prototype.onBackClick_ = function() {
  if (this.isFullscreenDisabled) {
    window.history.back();
  } else {
    this.anyModeToNormal_();
    this.setMode_(Modes.NORMAL);
  }
};

WebVRManager.prototype.onSettingsClick_ = function() {
  // Show the viewer selection dialog.
  this.viewerSelector.show();
};

/**
 *
 * Methods to go between modes.
 *
 */
WebVRManager.prototype.normalToMagicWindow_ = function() {
  // TODO: Re-enable pointer lock after debugging.
  //this.requestPointerLock_();
  this.requestFullscreen_();
};

WebVRManager.prototype.anyModeToVR_ = function() {
  this.effect.setFullScreen(true);
};

WebVRManager.prototype.vrToMagicWindow_ = function() {
  // Android bug: when returning from VR, resize the effect.
  //this.resize_();
}

WebVRManager.prototype.anyModeToNormal_ = function() {
  this.effect.setFullScreen(false);
  //this.releasePointerLock_();
  // Android bug: when returning from VR, resize the effect.
  this.resize_();
};

WebVRManager.prototype.resize_ = function() {
  this.renderer.setSize(window.innerWidth, window.innerHeight);
};

WebVRManager.prototype.onOrientationChange_ = function(e) {
  this.updateRotateInstructions_();
  // Also hide the viewer selector.
  this.viewerSelector.hide();
};

WebVRManager.prototype.updateRotateInstructions_ = function() {
  this.rotateInstructions.disableShowTemporarily();
  // In portrait VR mode, tell the user to rotate to landscape.
  if (this.mode == Modes.VR && !Util.isLandscapeMode() && Util.isMobile()) {
    this.rotateInstructions.show();
  } else {
    this.rotateInstructions.hide();
  }
};

WebVRManager.prototype.onFullscreenChange_ = function(e) {
  // If we leave full-screen, go back to normal mode.
  if (document.webkitFullscreenElement === null ||
      document.mozFullScreenElement === null) {
    this.anyModeToNormal_();
    this.setMode_(Modes.NORMAL);
  }
};

WebVRManager.prototype.requestPointerLock_ = function() {
  var canvas = this.renderer.domElement;
  if (canvas.requestPointerLock) {
    canvas.requestPointerLock();
  } else if (canvas.mozRequestPointerLock) {
    canvas.mozRequestPointerLock();
  } else if (canvas.webkitRequestPointerLock) {
    canvas.webkitRequestPointerLock();
  }
};

WebVRManager.prototype.releasePointerLock_ = function() {
  if (document.exitPointerLock) {
    document.exitPointerLock();
  } else if (document.mozExitPointerLock) {
    document.mozExitPointerLock();
  } else if (document.webkitExitPointerLock) {
    document.webkitExitPointerLock();
  }
};

WebVRManager.prototype.requestOrientationLock_ = function() {
  if (screen.orientation && Util.isMobile()) {
    screen.orientation.lock('landscape');
  }
};

WebVRManager.prototype.releaseOrientationLock_ = function() {
  if (screen.orientation) {
    screen.orientation.unlock();
  }
};

WebVRManager.prototype.requestFullscreen_ = function() {
  var canvas = this.renderer.domElement;
  if (canvas.requestFullscreen) {
    canvas.requestFullscreen();
  } else if (canvas.mozRequestFullScreen) {
    canvas.mozRequestFullScreen();
  } else if (canvas.webkitRequestFullscreen) {
    canvas.webkitRequestFullscreen();
  }
};

WebVRManager.prototype.exitFullscreen_ = function() {
  if (document.exitFullscreen) {
    document.exitFullscreen();
  } else if (document.mozCancelFullScreen) {
    document.mozCancelFullScreen();
  } else if (document.webkitExitFullscreen) {
    document.webkitExitFullscreen();
  }
};

WebVRManager.prototype.onViewerChanged_ = function(viewer) {
  // Notify anyone interested in this event.
  this.emit('viewerchange', viewer);
};

module.exports = WebVRManager;
