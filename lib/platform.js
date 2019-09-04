'use strict';

var util = require('util');
var pwabuilderLib = require('pwabuilder-lib');

var webapk = require('./webapks_pb');
var fetch = require('node-fetch');
var URL = require('url').URL;
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
  self.token = process.env.WEBAPKTOKEN;
  self.webapkApiUrl = process.env.WEBAPKAPIURL;
  self.webapkUrl = process.env.WEBAPKURL;
  self.apkName = process.env.ORIGINAPKNAME;

  /**
   * returns a url to download a generated webapk
   * @param  {json} manifest        manifest data
   * @param  {string} chromeVersion chrome version from user agent
   * @return {string}               url of generated apk
   */
  self.create = function (manifest, chromeVersion, callback) {
    const headers = {
      "Accept": "application/x-protobuf",
      "Content-Type": "application/x-protobuf",
      "X-Api-Key": self.token
    }
    var icons = manifest.content.icons;
    var webApkImage = new webapk.Image();
    webApkImage.setUsagesList(0);
    webApkImage.setSrc(icons[0]["src"]);

    var webAppManifest = new webapk.WebAppManifest();
    const name = manifest.content.name;
    const short_name = manifest.content.short_name;
    const start_url = manifest.content.start_url;
    const scopes = (new URL(start_url)).origin;
    const orientation = manifest.content.orientation;
    const display_mode = manifest.content.display;
    const theme_color = manifest.content.theme_color;
    const background_color = manifest.content.background_color;

    webAppManifest.setName(name);
    webAppManifest.setShortName(short_name);
    webAppManifest.setStartUrl(start_url);
    webAppManifest.setScopesList([scopes]);
    webAppManifest.setIconsList([webApkImage]);
    webAppManifest.setOrientation(orientation);
    webAppManifest.setDisplayMode(display_mode);
    webAppManifest.setThemeColor(theme_color);
    webAppManifest.setBackgroundColor(background_color);
    webAppManifest.addIcons();

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

    console.log('webApkMessage', webApkMessage);

    var bytes = webApkMessage.serializeBinary();
    console.log('bytes', bytes);

    console.log('about to make post to url');

    return nodeify(fetch(self.webapkApiUrl, {
      method: "POST",
      headers: headers,
      body: bytes
    }).then(response =>
      response.arrayBuffer())
      .then(response => {
        console.log(response);
        var bytes = new Uint8Array(response);
        var res = webapk.WebApkResponse.deserializeBinary(bytes).array;
        var webApkResponse = new webapk.WebApkResponse(res);
        var object = webApkResponse.toObject();
        var objPackageName = object.packageName;
        var version = object.version;
        var token = object.token;
        var link = self.webapkUrl + token + "/" + version + "/" + objPackageName + ".apk";
        console.log(link);
        return link;
      }).then(link => { 
        return link;
     }), callback);
      // .catch(err => console.log(err));
  };
}

util.inherits(Platform, PlatformBase);

module.exports = Platform;