
var Crawler = require('crawler');
var util = require('util');
var fs = require('fs');
var Promise = require('node-promise').Promise;
var all = require('node-promise').all;

var UpworkCodersCrawler = function (query) {
  this.BASE_URL = 'https://www.upwork.com';
  this.BASE_SEARCH_URL = this.BASE_URL + '/o/profiles/browse/';
  this.BASE_CODER_URL = this.BASE_URL + '/freelancers/';
  this.PROFILE_DATA_URL = this.BASE_URL + '/freelancers/api/v1/profile/';

  this.HEADERS = Object.freeze({
    'x-xsrf-token': '50322f515a2b5a81fba4e95e2933918e',
    'x-odesk-csrf-token': '50322f515a2b5a81fba4e95e2933918e',
    'cookie': 'session_id=a55d99407cf83e479f06bc6ee59567c5'
  });
  this.AJAX_HEADERS = JSON.parse(JSON.stringify(this.HEADERS));
  this.AJAX_HEADERS['x-requested-with'] = 'XMLHttpRequest';
  Object.freeze(this.AJAX_HEADERS);

  this.links = [];
  this.data = [];

  this.query = query;
};

UpworkCodersCrawler.prototype.collectLinksOnPage = function (pageNumber) {
  var collected = new Promise();
  var self = this;

  console.log('Start collect links on page', pageNumber);

  var callback = function (error, result, $) {
    $('.oProfileTileTitle a').each(function (i, item) {
      self.links.push(
        self.BASE_URL + $(item).attr('href')
      );
    });
  };

  var onDrain = function () {
    console.log('Finish collect links on page', pageNumber);
    collected.resolve(self.links);
  };

  var crawler = new Crawler({
    callback: callback,
    onDrain: onDrain
  });

  var queryString = self.BASE_SEARCH_URL +
    '?q=' + self.query +
    '&page=' + pageNumber +
    '&pt=independent';

  crawler.queue({
    headers: self.HEADERS,
    uri: queryString
  });

  return collected;
};

UpworkCodersCrawler.prototype.collectLinks = function () {
  var collected = new Promise();
  var promises = [];
  var self = this;

  console.log('Start links collecting');

  // get max page number
  var crawler = new Crawler({
    callback: function (error, result, $) {
      var lastPageButton = $('.pagination .active a');
      var lastPageNumber = +lastPageButton.html();
      console.log('lastPageNumber', lastPageNumber);

      lastPageNumber = 1;
      for (var i = 1; i <= lastPageNumber; i++) {
        promises.push(
          self.collectLinksOnPage(i)
        );
      }

      all(promises).then(function () {
        console.log('Finish links collecting');
        collected.resolve(self.links);
      });
    }
  });

  crawler.queue({
    uri: self.BASE_SEARCH_URL + '?q=' + self.query + '&page=1000',
    // uri: 'https://www.upwork.com/o/profiles/browse/?page=10000&q=react',
    headers: self.HEADERS
  });

  return collected;
};

UpworkCodersCrawler.prototype.parseProfile = function (url) {
  var parsed = new Promise();
  var self = this;

  console.log('Start parsing profile', url);

  var crawler = new Crawler({
    callback: function (error, result, $) {
      var regexp = /\"userId\"\:\"(\d{18})/;
      var id = regexp.exec(result.body)[1];
      var dataUrl = self.PROFILE_DATA_URL + id;

      var dataCrawler = new Crawler({
        callback: function (error, result) {
          result = JSON.parse(result.body);
          self.data = self.data.concat(result.assignments);
          console.log('Finish parsing profile', url);
          parsed.resolve();
        }
      });

      dataCrawler.queue({
        uri: dataUrl,
        headers: self.HEADERS
      });
    }
  });

  crawler.queue({
    uri: url,
    headers: self.HEADERS
  });

  return parsed;
};

UpworkCodersCrawler.prototype.parseProfiles = function (urls) {
  var promises = [];
  var parsed = new Promise();
  var self = this;

  console.log('Start profiles parsing');
  console.log(urls);

  urls.forEach(function (url) {
    promises.push(
      self.parseProfile(url)
    );
  });

  all(promises).then(function () {
    parsed.resolve();
    console.log('Finish prifiles parsing');
  });

  return parsed;
};

UpworkCodersCrawler.prototype.run = function () {
  var promise = new Promise();
  var self = this;

  self
    .collectLinks(this.query)
    .then(function (data) {
      var crawled = self.parseProfiles([data[0]]);

      crawled.then(function () {
        promise.resolve(self.data);
      });
    });

  return promise;
};

module.exports = UpworkCodersCrawler;