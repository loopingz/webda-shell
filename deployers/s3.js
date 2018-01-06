"use strict";
const AWSDeployer = require("./aws");
const fs = require('fs');

class S3Deployer extends AWSDeployer {

  deploy(args) {
    console.log('Deploy on S3', args);
    let s3 = new (this._getAWS(this.resources)).S3();
    return s3.listBuckets().promise().then( (res) => {
      console.log('Buckets:' + res);
    }).catch ( (err) => {
      console.log(err);
    });
  }

  static getModda() {
    return {
      "uuid": "WebdaDeployer/S3",
      "label": "S3",
      "description": "Deploy a S3 public website",
      "logo": "images/icons/s3.png",
      "configuration": {
        "widget": {
          "tag": "webda-s3-deployer",
          "url": "elements/deployers/webda-s3-deployer.html"
        },
        "default": {
          "source": "./folder",
          "target": "s3://mybucket"
        },
        "schema": {
          type: "object"
        }
      }
    }
  }
}

module.exports = S3Deployer;
