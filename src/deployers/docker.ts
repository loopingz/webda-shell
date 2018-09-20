import {
  Deployer
} from './deployer';
import {
  DockerMixIn
} from './docker-mixin';

export class DockerDeployer extends DockerMixIn(Deployer) {

  async deploy(args) {
    this._sentContext = false;
    this._maxStep = 3;
    if (!this.resources.tag || !this.resources.push) {
      this._maxStep = 2;
    }

    await this.buildDocker();
    if (!this.resources.tag || !this.resources.push) {
      return;
    }
    await this.pushDocker();
  }

  async buildDocker() {
    this.stepper("Building Docker image");
    let cmd = '';
    if (this.resources.worker !== 'API') {
      cmd = 'worker ' + this.resources.worker;
    }
    return super.buildDocker(this.resources.tag, this.resources.Dockerfile, await this.getDockerfile(cmd));
  }

  pushDocker() {
    this.stepper("Pushing Docker image");
    return super.pushDocker(this.resources.tag);
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
        "default": {},
        "schema": {
          type: "object"
        }
      }
    }
  }
}
