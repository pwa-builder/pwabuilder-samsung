'use strict';

var util = require('util');
var pwabuilderLib = require('pwabuilder-lib');

var webapk = require('./webapks_pb');
var fetch = require('node-fetch');
var URL = require('url').URL;
var path = require('path');
var nodeify = require('nodeify');

var CustomError = pwabuilderLib.CustomError,
  PlatformBase = pwabuilderLib.PlatformBase,
  manifestTools = pwabuilderLib.manifestTools,
  fileTools = pwabuilderLib.fileTools;

var constants = require('./constants');

function Platform(packageName, platforms) {

  var self = this;

  PlatformBase.call(this, constants.platform.id, constants.platform.name, packageName, __dirname);

  // save platform list
  self.platforms = platforms;

  // environment variables
  self.token = "afatk4luov5GJn6oXIFL8OHEce6AP9JGseQADSpl";

  self.webapkApiUrl = "https://webapk-api.internet.apps.samsung.com/v1/pwabuilder";

  self.webapkUrl = "https://webapk-cdn.internet.apps.samsung.com/";

  self.apkName = "com.sec.android.app.sbrowser";
  

  self.hexToLong = function(value) {
    if (value) {
      return (parseInt(value.replace('#', 'FF'), 16) -4294967296).toString() + 'L';
    }
  }

  /**
   * returns a url to download a generated webapk
   * @param  {json} manifest        manifest data
   * @param  {string} chromeVersion chrome version from user agent
   * @param  {string} href          location.href of website used in case of empty scope
   * @return {string}               url of generated apk
   */
  
  self.create = function (manifest, rootDir, chromeVersion, callback) {
    self.info('Generating the ' + constants.platform.name + 'app...');

    var platformDir = self.getOutputFolder(rootDir);
    var sourceDir = path.join(platformDir, 'source');

    self.info('platformDir', platformDir);
    self.debug('Creating the ' + constants.platform.name + ' app folder...');

    return fileTools.mkdirp(platformDir)
    .then(async function () {

      const headers = {
        "Accept": "application/x-protobuf",
        "Content-Type": "application/x-protobuf",
        "X-Api-Key": self.token
      }
  
      var webAppManifest = new webapk.WebAppManifest();
      const primary_icon = 1;
      const name = manifest.content.name;
      const short_name = manifest.content.short_name;
      const start_url = manifest.content.start_url;
      var scopes = manifest.content.scope;
      if (!scopes) {
        scopes = start_url;
      }
      const orientation = manifest.content.orientation;
      const display_mode = manifest.content.display;
      const theme_color = self.hexToLong(manifest.content.theme_color);
      const background_color = self.hexToLong(manifest.content.background_color);

      const icons = manifest.content.icons;
      const imageLink = icons[0]["src"];
      let imageBuffer;

      const response = await fetch(imageLink);
      const images = await response.blob();
      const buffer = await images.arrayBuffer();

      let webApkImage = new webapk.Image();
      webApkImage.setUsagesList(primary_icon);
      webApkImage.setSrc(imageLink);
      webApkImage.setImageData(new Uint8Array(buffer));
  
      webAppManifest.setName(name);
      webAppManifest.setShortName(short_name);
      webAppManifest.setStartUrl(start_url);
      webAppManifest.setScopesList([scopes]);
      webAppManifest.setIconsList([webApkImage]);
      webAppManifest.setOrientation(orientation);
      webAppManifest.setDisplayMode(display_mode);
      webAppManifest.setThemeColor(theme_color);
      webAppManifest.setBackgroundColor(background_color);
  
      // webapk data
      const updateReason = "1";
      const package_name = manifest.default.short_name;
      const version = manifest.content.version;
      const manifest_url = manifest.generatedUrl;
      const appManifest = webAppManifest;
      const requester_application_version = chromeVersion;
      const requester_application_package = self.apkName;
      const android_abi = "armeabi-v7a";
      const stale_manifest = 0;
  
      var webApkMessage = new webapk.WebApk();
      webApkMessage.setUpdateReason(updateReason);
      webApkMessage.setPackageName(package_name);
      webApkMessage.setVersion(version);
      webApkMessage.setManifestUrl(manifest_url);
      webApkMessage.setManifest(webAppManifest);
      webApkMessage.setRequesterApplicationPackage(requester_application_package);
      webApkMessage.setRequesterApplicationVersion(requester_application_version);
      webApkMessage.setAndroidAbi(android_abi);
      webApkMessage.setStaleManifest(stale_manifest);
  
  
      var bytes = webApkMessage.serializeBinary();
  
      return fetch(self.webapkApiUrl, {
        method: "POST",
        headers: headers,
        body: bytes
      })
      .then(response =>
        response.arrayBuffer())
      .then(response => {
          var bytes = new Uint8Array(response);
          var res = webapk.WebApkResponse.deserializeBinary(bytes).array;
          var webApkResponse = new webapk.WebApkResponse(res);
          var object = webApkResponse.toObject();
          var objPackageName = object.packageName;
          var version = object.version;
          var token = object.token;

          var link = self.webapkUrl + token + "/" + version + "/" + objPackageName + ".apk";
          return link;
      }).then(async link => {
          console.log('link', link);
          const response = await fetch(link);
          return response;
      }).then(async function(response) {
          const blob = await response.blob();
          const buffer = await blob.arrayBuffer();
          const goodBuff = Buffer.from(buffer);
          return fileTools.writeFile(sourceDir + 'app.apk', goodBuff);
        })
      .then(function () {
          self.debug('Copying the ' + constants.platform.name + ' manifest to the app folder...');
          var manifestFilePath = path.join(platformDir, 'manifest.json');
          return manifestTools.writeToFile(manifest, manifestFilePath);
        })
    })
    .nodeify(callback);
  };
}

util.inherits(Platform, PlatformBase);

module.exports = Platform;