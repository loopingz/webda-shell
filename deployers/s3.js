"use strict";
const Deployer = require("./deployer");
const fs = require('fs');

class S3Deployer extends Deployer {

  deploy(args) {
    console.log('Deploy on S3', args);
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
