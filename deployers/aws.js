const Deployer = require('./deployer');
const AWSServiceMixin = require('webda/services/aws');

class AWSDeployer extends AWSServiceMixin(Deployer) {

  _getAWS(params) {
    return super._getAWS(params || this.resources)
  }

  _createCertificate(domain) {
    let config = JSON.parse(JSON.stringify(this.resources));
    // CloudFront only use certificate in us-east-1 region...
    config.region = 'us-east-1';
    this._acm = new (this._getAWS(config)).ACM();

    return this._acm.listCertificates({}).promise().then( (res) => {
      for (let i in res.CertificateSummaryList) {
        if (res.CertificateSummaryList[i].DomainName === domain && res.CertificateSummaryList[i] !== 'FAILED') {
          this._certifcate = res.CertificateSummaryList[i];
          return Promise.resolve(this._certifcate);
        }
      }
      if (!this._certifcate) {
        // Create certificate
        let params = {
          DomainName: domain,
          DomainValidationOptions: [
            {
              DomainName: domain,
              ValidationDomain: domain
            }
          ],
          ValidationMethod: 'DNS',
          IdempotencyToken: 'WebdaSSL_' + domain.replace(/[^\w]/g, '_')
        };
        return this._acm.requestCertificate(params).promise().then( (res) => {
          this._certifcate = res;
          return new Promise( (resolve) => {
            // Wait 5s for challenge to be generated
            setTimeout(resolve.bind(this, res), 5000);
          });
        });
      }
      return Promise.reject();
    }).then( (cert) => {
      return this._acm.describeCertificate({CertificateArn: cert.CertificateArn}).promise();
    }).then( (res) => {
      let cert = res.Certificate;
      if (cert.Status === 'FAILED') {
        return Promise.reject('Certificate validation has failed');
      }
      if (cert.Status === 'PENDING_VALIDATION') {
        // On create need to wait
        let record = cert.DomainValidationOptions[0].ResourceRecord;
        console.log('Need to validate certificate', cert.CertificateArn);
        return this._createDNSEntry(record.Name, 'CNAME', record.Value).then( () => {
          // Waiting for certificate validation
          return this._waitFor('Waiting for certificate validation', (resolve, reject) => {
            return this._acm.describeCertificate({CertificateArn: cert.CertificateArn}).promise().then( (res) => {
              if (res.Certificate.Status === 'ISSUED') {
                resolve(res.Certificate);
                return Promise.resolve(true);
              }
              if (res.Certificate.Status !== 'PENDING_VALIDATION') {
                reject(res.Certificate);
                return Promise.resolve(true);
              }
              return Promise.resolve(false);
            });
          }, 60000, 10);
          return Promise.resolve(cert);
        });
      }
      return Promise.resolve(cert);
    });
  }

  _waitForInternal(timeout, maxRetry, resolve, reject) {
    if (this._waitLabel) {
      console.log('[' + this._try + '/' + this._maxTry + ']', this._waitLabel);
    }
    this._waitCall(resolve, reject).then( (val) => {
      if (val) return;
      this._try++;
      if (maxRetry > 0) {
        setTimeout(this._waitForInternal.bind(this, timeout * 2, maxRetry-1, resolve, reject), timeout);
      } else {
        reject();
      }
    });
  }

  _waitFor(label, call, timeout, maxRetry) {
    this._try = 1;
    this._maxTry = maxRetry;
    this._waitLabel = label;
    this._waitCall = call;
    timeout = timeout || 5000;
    return new Promise( (resolve, reject) => {
      this._waitForInternal(timeout, maxRetry, resolve, reject);
    });
  }

  _createDNSEntry(domain, type, value) {
    let params;
    if (!domain.endsWith('.')) {
      domain = domain + '.';
    }
    let targetZone;
    // Find the right zone
    this._r53 = new (this._getAWS(this.resources)).Route53();
    // Identify the right zone first
    return this._r53.listHostedZones().promise().then( (res) => {
      for (let i in res.HostedZones) {
        let zone = res.HostedZones[i];
        if (domain.endsWith(zone.Name)) {
          if (targetZone && targetZone.Name.length > zone.Name.length) {
            // The previous target zone is closer to the domain
            continue;
          }
          targetZone = zone;
        }
      }
      if (!targetZone) {
        return Promise.reject('Domain is not handled on AWS');
      }
      params = {
        HostedZoneId: targetZone.Id,
        StartRecordName: domain,
        StartRecordType: type
      }
      return this._r53.listResourceRecordSets(params).promise();
    }).then( (res) => {
      let targetRecord;
      for (let i in res.ResourceRecordSets) {
        let record = res.ResourceRecordSets[i];
        if (record.Type === type && record.Name === domain) {
          targetRecord = record;
          break;
        }
      }
      let params = {
        HostedZoneId: targetZone.Id,
        ChangeBatch: {
          Changes: [{
            Action: 'UPSERT',
            ResourceRecordSet: {
              Name: domain,
              ResourceRecords: [{Value:value}],
              TTL: 360,
              Type: type
            }
          }],
          Comment: 'webda-automated-deploiement'
        }
      };
      if (!targetRecord || targetRecord.ResourceRecords[0].Value !== value) {
        console.log('Creating record', domain, type, value);
      } else if (targetRecord.ResourceRecords[0].Value === value) {
        // Dont do anything the record exist with the right value
        return Promise.resolve();
      } else {
        console.log('Updating record', type, domain, value);
      }
      return this._r53.changeResourceRecordSets(params).promise();
    }).then( () => {
      return Promise.resolve();
    });
  }

  tagResource(resource, tags) {

  }
}

module.exports = AWSDeployer;
