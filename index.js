var express = require('express'),
    sys = require('sys'),
    exec = require('child_process').exec,
    forever = require('forever'),
    path = require('path'),
    fs = require('fs'),
    bodyparser = require('body-parser'),
    json = require('json-middleware').middleware();

/*
Example config file: 
[{
  "deployFolder": "../emilaxelsson.se/",
  "executableFile": "../emilaxelsson.se/index.js",
  "repositoryUrl": "git://github.com/emiax/emilaxelsson.se.git",
  "branch": "master"
}]
*/
var CONFIG_FILE = 'config.json';
var PORT = '8999';

var server = express();
server.use(bodyparser());
server.use(json);

/**
 * Extract branch name from a full Git ref.
 */
function extractBranch(ref) {
  var matches = /^refs\/heads\/(.*)$/.exec(ref);
  return matches[1];
}

/*
 * Return bash command to start process
 */
function startCommand(file) {
  return 'forever start ' + path.join(__dirname, file);
}

/*
 * Return bash command to restart process
 */
function stopCommand(file) {
  var absolutePath = path.join(__dirname, file);
  return [
    'forever stop ' + absolutePath,
  ].join('\n');
}

/*
 * Return bash command to deploy
 */
function deployCommand(deployFolder, executableFile, repositoryUrl, branch) {
  var command = [
    stopCommand(executableFile),
    'here=`pwd`',
    'cd ' + deployFolder,
    'git init',
    'git stash',
    'git pull ' + repositoryUrl + ' ' + branch,
    'npm install',
    'cd $here',
    startCommand(executableFile)
  ].join('\n');
  return command;
}

/**
 * Read config from fileName and invoke callback(data) when done. 
 */
function readConfig(fileName, callback) {
  fs.readFile(fileName, 'utf8', function (err, data) {
    if (err) {
      console.error('error when reading config file: ' + err);
      return;
    }
    data = JSON.parse(data);
    callback(data);
  });
}

/**
 * Deploy config.
 */
function deployConfig(config, callback) {
  callback = callback || function () {};
  var command = deployCommand(config.deployFolder,
                              config.executableFile,
                              config.repositoryUrl,
                              config.branch);
  console.log(command);
  exec(command, function (err, stdout, stderr) {
    if (err) {
      console.error('error when deploying ' + JSON.stringify(config) +
                    '\nYielded:' + err +
                    '\nCommand was:\n' + command);
      callback(err);
    } else {
      console.log('successfully deployed ' + config.executableFile);
      callback(null);
    }
  });
}

/**
 * When we recieve a poke
 */
server.post('/', function (req, res) {
  var input = req.body;

  if (!input) {
    res.send('malformed json.\n');
    console.log('malformed json');
    return;
  }

  var repositoryUrl = input.repository.git_url;
  var branch = extractBranch(input.ref);

  if (!repositoryUrl || !branch) return;

  readConfig(CONFIG_FILE, function (configs) {
    // filter out configs to deploy.
    var toUpdate = configs.filter(function (config) {
      return config.repositoryUrl === repositoryUrl && config.branch === branch;
    });
    
    // deploy.
    toUpdate.forEach(function (config) {
      deployConfig(config, function(err) {
        if (!err) {
          res.send('successfully deployed!\n');
        }
      });
    });
  });
});

/**
 * When deployer is started, deploy everything!
 */
readConfig(CONFIG_FILE, function (configs) {
  configs.forEach(function (config) {
    deployConfig(config);    
  });
});

server.listen(PORT);
