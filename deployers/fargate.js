"use strict";
const AWSDeployer = require("./aws");
const DockerMixIn = require("./docker-mixin");

class FargateDeployer extends DockerMixIn(AWSDeployer) {

  deploy(args) {
    this._ecr = new (this._getAWS()).ECR();
    this._ecs = new (this._getAWS()).ECS();

    this._sentContext = false;
    this._maxStep = 2;

    return this._createRepository().then( () => {
      return this.buildDockers();
    }).then(() => {
      return this._createTaskDefinition();
    }).then(() => {
      return this._createCluster();
    }).then(() => {
      return this._createService();
    });
  }

  buildDockers() {
    let promise = this._ecr.getAuthorizationToken({}).promise().then( (res) => {
      // Login to the AWS repository
      let creds = Buffer.from(res.authorizationData[0].authorizationToken, 'base64').toString();
      creds = creds.substr(4);
      let repo = res.authorizationData[0].proxyEndpoint;
      return this.execute('docker', ['login', '--username', 'AWS', '--password-stdin', repo], this.out.bind(this), this.out.bind(this), creds);
    });
    for (let i in this._workers) {
      let worker = this._workers[i];
      promise = promise.then( () => {
        let cmd = '';
        if (worker.name !== 'API') {
          cmd = 'worker ' + worker.name;
        }
        console.log('Building the image');
        return this.buildDocker(worker.repository, null, this.getDockerfile(cmd)).then( () => {
          console.log('Pushing the image');
          return this.pushDocker(worker.repository);
        });
      })
    }
    return promise;
  }

  _createService() {

  }

  _createRepository() {
    let repositories = [];
    this._workers = {};
    let namespace = this.resources.repositoryNamespace || this.resources.serviceName;
    this.resources.workers.forEach( (worker) => {
      this._workers[worker.toLowerCase()] = {name: worker};
      repositories.push((namespace + '/' + worker).toLowerCase());
    });
    // Might want to use only one repository with tagging to optimize storage
    return this._ecr.describeRepositories({}).promise().then( (res) => {
      res.repositories.forEach( (repo) => {
        let idx = repositories.indexOf(repo.repositoryName);
        if (idx >= 0) {
          this._workers[repo.repositoryName.split('/')[1]].repository = repo.repositoryUri;
          repositories.splice(idx, 1);
        }
      });
      let promise = Promise.resolve();
      repositories.forEach( (repo) => {
        promise = promise.then( () => {
          console.log('Create repository', repo);
          return this._ecr.createRepository({repositoryName: repo}).promise().then( (res) => {
            let repo = res.repository;
            this._workers[repo.repositoryName.split('/')[1]].repository = repo.repositoryUri;
          });
        });
      });
      return promise;
    });
  }

  _createTaskDefinition() {
    let taskDefinition = this.resources.taskDefinition || this.resources.serviceName;
    return this._ecs.listTaskDefinitions().promise().then( (res) => {
      console.log(res);
      if (!this._taskDefinition) {
        return;
        let containerDefinitions = [];
        return this._ecs.createTaskDefinition(
          {
            containerDefinitions: containerDefinitions,
            family: 'webda',
            taskRoleArn: '',
            volumes: []
          }
        ).promise();
      }
    });
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
