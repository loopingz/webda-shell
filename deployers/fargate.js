"use strict";
const AWSDeployer = require("./aws");
const DockerMixIn = require("./docker-mixin");
const fs = require('fs');

class FargateDeployer extends DockerMixIn(AWSDeployer) {

  deploy(args) {
    this._ecr = new (this._getAWS()).ECR();
    this._ecs = new (this._getAWS()).ECS();

    this._sentContext = false;
    this._maxStep = 2;
    this._cleanDockerfile = false;

    return this._createRepository().then( () => {
      return this.buildDocker('277712386420.dkr.ecr.us-east-1.amazonaws.com/webda-demo/api', null, this.getDockerfile('worker Worker'));
    }).then(() => {
      return this._createVPC();
    }).then(() => {
      return this._createCluster();
    });
  }

  _createRepository() {
    let repositories = [];
    let namespace = this.resources.repositoryNamespace || this.resources.serviceName;
    this.resources.workers.forEach( (worker) => {
      repositories.push((namespace + '/' + worker).toLowerCase());
    });
    // Might want to use only one repository with tagging to optimize storage
    return this._ecr.describeRepositories({}).promise().then( (res) => {
      res.repositories.forEach( (repo) => {
        let idx = repositories.indexOf(repo.repositoryName);
        if (idx >= 0) {
          repositories.splice(idx, 1);
        }
      });
      let promise = Promise.resolve();
      repositories.forEach( (repo) => {
        promise = promise.then( () => {
          console.log('Create repository', repo);
          return this._ecr.createRepository({repositoryName: repo}).promise();
        });
      });
      return promise;
    });
  }

  _createTaskDefinition() {
    return Promise.resolve();
  }

  _createCluster() {
    return this._ecs.describeClusters().promise().then( (res) => {
      console.log('cluster', res);
    });
  }

  _createVPC() {
    return Promise.resolve();
  }

  out(data) {
    data = data.toString();
    // Should filter output
    console.log(data);
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
          "workers": []
        },
        "schema": {
          type: "object"
        }
      }
    }
  }
}

module.exports = FargateDeployer;
