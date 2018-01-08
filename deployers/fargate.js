"use strict";
const AWSDeployer = require("./aws");
const fs = require('fs');

class FargateDeployer extends AWSDeployer {

  deploy(args) {
    this._ecr = new (this._getAWS()).ECR();
    this._ecs = new (this._getAWS()).ECS();

    this._sentContext = false;
    if (!this.resources.project || !this.resources.service) {
      console.log('You need to specify both service and project for Wedeploy');
      return Promise.reject();
    }
    this._maxStep = 2;
    this._cleanDockerfile = false;

    return this._createRepository().then( () => {
      return this.checkDockerfile();
    }).then(() => {
      return this.wedeploy();
    }).then(() => {
      return this.cleanDockerfile();
    }).catch(() => {
      return this.cleanDockerfile();
    });
  }

  _createRepository() {
    this._ecr.describeRepositories({repositoryNames: []}).promise().then( (res) => {
      console.log('repository', res);
    })
  }

  _createTaskDefinition() {

  }

  _createCluster() {
    this._ecs.describeClusters().promise().then( (res) => {
      console.log('cluster', res);
    });
  }

  _createVPC() {

  }

  wedeploy() {
    var args = ["deploy", "-p", this.resources.project, "-s", this.resources.service];
    return this.execute("we", args, this.out.bind(this), this.out.bind(this));
  }

  out(data) {
    data = data.toString();
    // Should filter output
    console.log(data);
  }

  checkDockerfile() {
    this.stepper("Checking Dockerfile");
    return new Promise((resolve, reject) => {
      this._cleanDockerfile = true;
      if (this.resources.Dockerfile === 'Dockerfile') {
        this._cleanDockerfile = false;
        return;
      } else if (this.resources.Dockerfile) {
        fs.copyFileSync(this.resources.Dockerfile, this.getDockerfileName());
      } else {
        fs.writeFileSync(this.getDockerfileName(), this.getDockerfile(this.resources.logfile, this.resources.command));
        this.resources.Dockerfile = this.getDockerfileName();
      }
      resolve();
      return;
    });
  }

  getDockerfileName() {
    // Cannot specify the Dockerfile name yet
    return './Dockerfile';
  }

  static getModda() {
    return {
      "uuid": "WebdaDeployer/Fargate",
      "label": "Fargate",
      "description": "Create a Fargate deploymentF",
      "webcomponents": [],
      "logo": "images/icons/fargate.png",
      "configuration": {
        "widget": {
          "tag": "webda-fargate-deployer",
          "url": "elements/deployers/webda-fargate-deployer.html"
        },
        "default": {
          "params": {},
          "resources": {
            "project": "projectName",
            "service": "serviceName"
          },
          "services": {}
        },
        "schema": {
          type: "object"
        }
      }
    }
  }
}

module.exports = FargateDeployer;
