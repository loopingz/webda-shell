"use strict";
const AWSDeployer = require("./aws");
const DockerMixIn = require("./docker-mixin");
const ECS_ROLE_POLICY = '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]}';

class FargateDeployer extends DockerMixIn(AWSDeployer) {

  deploy(args) {
    this._AWS = this._getAWS(this.resources);
    this._ecr = new (this._getAWS()).ECR();
    this._ecs = new (this._getAWS()).ECS();

    this._sentContext = false;
    this._maxStep = 2;

    this._workers = {};
    this.resources.workers.forEach( (worker) => {
      this._workers[worker.toLowerCase()] = {name: worker};
    });

    return this._createRepository().then( () => {
      return this.buildDockers();
    }).then(() => {
      if (this.resources.taskRole) {
        return Promise.resolve(this.resources.taskRole);
      }
      return this.generateRoleARN(this.resources.serviceName, ECS_ROLE_POLICY);
    }).then((res) => {
      this._taskRole = res;
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
    let namespace = this.resources.repositoryNamespace || this.resources.serviceName;
    this.resources.workers.forEach( (worker) => {
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

  _getWorkersDefinition() {
    let containerDefinitions = [];
    for (let i in this._workers) {
      let worker = this._workers[i];
      containerDefinitions.push({
        name: i,
        essential: true,
        image: worker.repository
      });
    }
    return containerDefinitions;
  }

  _needWorkersDefinitionUpdate(oldDef) {
    let newDef = this._getWorkersDefinition();
    // For now let's expected the order to be the same
    // TODO Easy improvement - implement order check
    let res = false;
    // For each worker definition
    for (let i in newDef) {
      // For each key defined for this worker
      for (let k in newDef[i]) {
        if (newDef[i][k] !== oldDef[i][k]) {
          return true;
        }
      }
    }
    return false;
  }

  _registerTaskDefinition(taskDefinition) {
    return this._ecs.registerTaskDefinition(
      {
        containerDefinitions: this._getWorkersDefinition(),
        family: taskDefinition,
        taskRoleArn: '',
        volumes: [],
        requiresCompatibilities: ['FARGATE'],
        networkMode: 'awsvpc',
        cpu: '1024',
        memory: '2048',
        executionRoleArn: 'arn:aws:iam::277712386420:role/ecsTaskExecutionRole'
      }
    ).promise().then( (res) => {
      this._taskDefinitionArn = res.taskDefinition.taskDefinitionArn;
    });
  }

  _createTaskDefinition() {
    // Check role ARN for cloudwatch and pull images
    let taskDefinition = this.resources.taskDefinition || this.resources.serviceName;
    //taskDefinition = 'webda-demo-fargate'
    return this._ecs.describeTaskDefinition({taskDefinition: taskDefinition}).promise().then( (res) => {
      console.log(res.taskDefinition.containerDefinitions, this._getWorkersDefinition());
      if (this._needWorkersDefinitionUpdate(res.taskDefinition.containerDefinitions)) {
        console.log('Need to update the task definition');
        return this._registerTaskDefinition(taskDefinition);
      }
      this._taskDefinitionArn = res.taskDefinition.taskDefinitionArn;
      return Promise.resolve();
    }).catch( (err) => {
      // Describe throw an error if not found
      return this._registerTaskDefinition(taskDefinition);
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
