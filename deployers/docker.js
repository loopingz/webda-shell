"use strict";
const Deployer = require("./deployer");
const DockerMixIn = require("./docker-mixin");

class DockerDeployer extends DockerMixIn(Deployer) {

  deploy(args) {
    this._sentContext = false;
    this._maxStep = 3;
    if (!this.resources.tag || !this.resources.push) {
      this._maxStep = 2;
    }
    this._cleanDockerfile = false;

    return this.buildDocker().then(() => {
      if (!this.resources.tag || !this.resources.push) {
        return Promise.resolve();
      }
      return this.pushDocker();
    });
  }

  buildDocker() {
    this.stepper("Building Docker image");
    return super.buildDocker(this.resources.tag, this.resources.Dockerfile, this.getDockerfile());
  }

  pushDocker() {
    this.stepper("Pushing Docker image");
    super.pushDocker(this.resources.tag);
  }

  static getModda() {
    return {
      "uuid": "WebdaDeployer/Docker",
      "label": "Docker",
      "description": "Create a Docker image and push it",
      "webcomponents": [],
      "logo": "images/icons/docker.png",
      "configuration": {
        "widget": {
          "tag": "webda-docker-deployer",
          "url": "elements/deployers/webda-docker-deployer.html"
        },
        "default": {
          "tag": "ImageTag",
          "push": false
        },
        "schema": {
          type: "object"
        }
      }
    }
  }
}

module.exports = DockerDeployer;
