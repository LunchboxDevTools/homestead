var Q = require('q');
var fs = require('fs');

var boot = require('./js/boot.js');

/**
 * Constructor.
 * 
 * @param {[type]} plugin [description]
 * @param {[type]} dialog [description]
 */
var Homestead = function (plugin, dialog) {
  // call parent constructor
  LunchboxPlugin.call(this, plugin, dialog);

  // load CSS dependencies
  this.addCSS('css/homestead.css');

  // global notices wrapper dom name
  this.gn_name = 'global-notices-' + this.getUniqueName();

  // create reprovision alert DOM
  var global_notices = $('#global-notices');
  if (global_notices.length) {
    global_notices.append('<div id="' + this.gn_name + '"></div>');

    var template =  '<div class="reprovision-alert alert alert-warning" style="display: none;" role="alert">';
        template +=   '<strong>' + this.plugin.name_nice + '</strong> needs to be re-provisioned with your new settings. ';
        template +=   '<a href="#" class="homestead-provision">Run this now.</a>';
        template += '</div>';

    $('#' + this.gn_name).append(template);
  }

  // control actions; must be unique relative to each other
  this.CONTROL_START = 0;
  this.CONTROL_STOP = 1;
  this.CONTROL_PROVISION = 2;
  this.CONTROL_RELOAD = 3;

  // possible VM states; binary flags - must be unique powers of 2
  this._RUNNING = 1;
  this._NEEDS_PROVISION = 2;

  // default state
  this.state = 0;

  // set default settings structure
  if (!this.plugin.settings) {
    this.plugin.settings = {
      needs_provision: false
    };
  }

  // do we need to run provision?
  if (this.plugin.settings.needs_provision) {
    this.state += this._NEEDS_PROVISION;
  }

  // promises for later use
  this.detected = Q.defer();
  this.loadedConfig = Q.defer();
  this.checkedState = Q.defer();
  this.controlChain = Q.fcall(function (){});

  // associate actions with their respective events
  this.bindEvents();
};

Homestead.prototype = Object.create(LunchboxPlugin.prototype);
Homestead.prototype.constructor = Homestead;

/**
 * Return an array of bootup operations.
 * 
 * @return {[type]} [description]
 */
Homestead.prototype.getBootOps = function () {
  var operations = [
    boot.checkPrerequisites,
    boot.detectVM,
    boot.loadVMConfig
  ];

  return operations;
};

/**
 * Shows alert to reprovision the VM
 * 
 * @return {[type]} [description]
 */
Homestead.prototype.showProvisionNotice = function () {
  if (!this.plugin.settings.needs_provision) {
    this.setProvision(true);
  }

  $('#' + this.gn_name + ' .reprovision-alert').show('fast');
};

/**
 * Hides alert to reprovision the VM
 * 
 * @return {[type]} [description]
 */
Homestead.prototype.hideProvisionNotice = function () {
  if (this.plugin.settings.needs_provision) {
    this.setProvision(false);
  }

  $('#' + this.gn_name + ' .reprovision-alert').hide('fast');
};

/**
 * Updates reprovision status in settings.
 * 
 * @param {[type]}   status   [description]
 * @param {Function} callback [description]
 */
Homestead.prototype.setProvision = function (status, callback) {
  callback = callback || function () {};

  this.plugin.settings.needs_provision = status;

  window.lunchbox.settings.save(callback);
};

/**
 * Returns an array describing the plugin's navigation.
 * 
 * @return {[type]} [description]
 */
Homestead.prototype.getNav = function () {
  var status_text = this.state & this._RUNNING ? 'Running' : 'Stopped';

  var nav = {
    title: 'Homestead <span class="homestead-status">' + status_text + '</span>',
    items: [
      {
        href: 'views/dashboard/dashboard.html',
        name: 'dashboard',
        text: '<i class="fa fa-homestead"></i> Dashboard'
      },
      {
        href: 'views/settings/settings.html',
        name: 'settings',
        text: '<i class="fa fa-cogs"></i> Settings',
      },
      {
        href: 'views/sites/sites.html',
        name: 'sites',
        text: '<i class="fa fa-globe"></i> Sites',
      },
      {
        href: 'views/tools/tools.html',
        name: 'tools',
        text: '<i class="fa fa-wrench"></i> Tools',
      }
    ],
  };

  return nav;
};

/**
 * Called during save operations. We remove items from settings that we
 * do not want to save.
 * 
 * @param  {[type]} settings [description]
 * @return {[type]}          [description]
 */
Homestead.prototype.preSave = function (settings) {
  if (settings) {
    //
  }
};

/**
 * Sets vagrant-related variables based on output of "vagrant global-status"
 * 
 * @return {[type]} [description]
 */
Homestead.prototype.detect = function () {
  var spawn = require('child_process').spawn;
  var child = spawn('vagrant', ['global-status']);

  // save buffer output
  var stdout = '';
  var write = function (buffer) {
    stdout += buffer.toString('utf8');
  };

  child.stdout.on('data', write);
  child.stderr.on('data', write);

  var self = this;
  child.on('exit', function (exit_code) {
    if (exit_code !== 0) {
      self.detected.reject('Encountered problem while running "vagrant global-status".');
      return;
    }

    // search for the homestead entry and parse it
    var lines = stdout.split("\n");
    for (var x in lines) {
      var parts = lines[x].split(/\s+/);

      // Sample: d21e8e6  homestead virtualbox poweroff /home/jon/Projects/homestead
      if (parts.length >= 5 && parts[1] == 'homestead') {
        self.id = parts[0];
        self.name = parts[1];

        // have to get all the parts of the path if it contains spaces
        self.home = '';
        for (var i = 4; i < parts.length; i++) {
          self.home += parts[i] + ' ';
        }
        self.home = self.home.trim();

        self.state += parts[3] == 'running' ? self._RUNNING : 0;
        self.stateChange();

        self.detected.resolve();

        return;
      }
    }

    var os = require('os');
    var homedir = os.homedir();
    var box_log = function(message) {
      $('#homestead_plugin_dialog_log').append(message + '\n');
    };

    var resolve_setup = function(home_path) {
      box_log('Done setting up Homestead');
      self.home = home_path;
      self.detected.resolve();
      setTimeout(function() {
        box.modal('hide'); // only close if everything succeeds
      }, 1000);
    };

    var clone_homestead = function() {
      box_log('Cloning Homestead');
      var clone_path = window.lunchbox.user_data_path + '/homestead';
      var git_path = 'https://github.com/laravel/homestead.git';

      box_log('Cloning Homestead from ' + git_path);

      var child = spawn('git', ['clone', git_path, clone_path]);

      child.on('exit', function (exit_code) {

        if (exit_code) {
          box_log('Could not clone Homestead Git repository to ' + clone_path);
          return;
        }

        box_log('Cloned Homestead to ' + clone_path);
        var init_homestead = function() {
          var rimraf = require('rimraf');
          var start_dir = process.cwd();
          try {
            // have to change to the new directory to run init script
            process.chdir(clone_path);
          } catch (err) {
            console.log('chdir: ' + err);
            return;
          }

          // have to clear out ~/.homestead because init script prompts
          // to confirm overwrite if the files already exist
          rimraf(homedir + '/.homestead', function(err) {
            if (err) {
              box_log(err);
              return;
            }

            // make sure we get the right script
            var command;
            var args;
            if (/^win/.test(os.platform())) {
              command = 'init.bat';
              args = [];
            } else {
              command = 'bash';
              args = ['init.sh'];
            }
            var init_process = spawn(command, args);
            init_process.on('exit', function(exit_code) {
              if (exit_code) {
                box_log('Could not initialize Homestead');
              } else {
                setup_config_file();
              }

              try {
                // change back to the Lunchbox app's directory
                process.chdir(start_dir);
              } catch (err) {
                console.log('chdir: ' + err);
                return;
              }
            });

            init_process.stdout.on('data', function (data) {
              box_log('stdout: ' + data);
            });

            init_process.stderr.on('data', function (data) {
              box_log('stderr: ' + data);
            });
          });
        };

        var setup_config_file = function() {
          var config_file = homedir + '/.homestead/Homestead.yaml';
          box_log('Setting up config file');
          fs.readFile(config_file, 'utf-8', function(err, data) {
            if (err) {
              box_log(err);
            } else {
              // surround the mapped path with quotes in case of spaces
              var new_value = data.replace('~/Code', "'" + clone_path + "'");
              fs.writeFile(config_file, new_value, 'utf-8', function(err) {
                if (err) {
                  box_log(err);
                } else {
                  setup_vagrantfile();
                }
              });
            }
          });
        };

        var setup_vagrantfile = function() {
          var vagrantfile = clone_path + '/Vagrantfile';
          box_log('Setting up Vagrantfile');
          fs.readFile(vagrantfile, 'utf-8', function(err, data) {
            if (err) {
              box_log(err);
            } else {
              var lines = data.trim().split('\n');
              var new_value = '';
              var i = 0;
              for (; i < lines.length; i++) {
                new_value += lines[i] + '\n';
                if (lines[i].indexOf('Vagrant.configure') == 0) {
                  break;
                }
              }

              if (i >= lines.length) {
                box_log('Could not find configuration inside Vagrantfile');
                return;
              }

              new_value += '    config.vm.define "homestead" do |homestead|\n';
              new_value += '        homestead.vm.box = "laravel/homestead"\n';
              for (i = i + 1; i < lines.length; i++) {
                new_value += '    ' + lines[i].replace('config.', 'homestead.') + '\n';
              }
              new_value += 'end\n';

              fs.writeFile(vagrantfile, new_value, 'utf-8', function(err) {
                if (err) {
                  box_log(err);
                } else {
                  resolve_setup(clone_path);
                }
              });
            }
          });
        };

        init_homestead();
      });
    };

    var set_homestead_location = function() {
      bootbox.prompt("Please enter the full path to your Homestead directory.", function(path) {
        if (path === null) {
          return;
        }

        if (path.charAt(path.length - 1) == '/' || path.charAt(path.length - 1) == '\\') {
          path = path.slice(0, -1);
        }

        var check_path = function() {
          box_log('Checking if ' + path + ' is a valid directory');
          fs.lstat(path, function(err, stats) {
            if (err) {
              box_log(err);
            } else if (!stats.isDirectory()) {
              box_log(path + ' is not a valid directory');
            } else {
              check_vagrantfile();
            }
          });
        }; // checkPath

        // make sure Vagrantfile exists
        var check_vagrantfile = function() {
          box_log('Checking if Vagrantfile exists');
          fs.lstat(path + '/Vagrantfile', function(err, stats) {
            if (err) {
              box_log(err);
            } else if (!stats.isFile()) {
              box_log('Vagrantfile does not exist at ' + path);
            } else {
              check_config_file();
            }
          });
        }; // checkVagrantfile

        // make sure the config file is already set up
        var check_config_file = function() {
          box_log('Checking if configuration file exists');
          fs.lstat(homedir + '/.homestead/Homestead.yaml', function(err, stats) {
            if (err) {
              box_log(err);
            } else if (!stats.isFile()) {
              box_log('Could not locate configuration file at ' + homedir + '/.homestead');
            } else {
              resolve_setup(path);
            }
          });
        }; // checkConfigFile

        check_path();
      }); // bootbox.prompt
    };

    var box = bootbox.dialog({
      closeButton: false,
      title: 'Could not find "homestead" virtualbox.',
      message: ''
        + '<div>'
        +   '<label for="btnClone">Clone Homestead from GitHub? </label>'
        +   '<button id="btnClone" class="btn btn-primary" style="float: right;">Clone</button>'
        + '</div>'
        + '<hr/>'
        + '<div>'
        +   '<label for="btnSetLoc">Show us where Homestead is installed? </label>'
        +   '<button id="btnSetLoc" class="btn btn-primary" style="float: right;">Set Location</button>'
        + '</div>'
        + '<hr/>'
        + '<pre id="homestead_plugin_dialog_log"></pre>'
        + '',
      buttons: {
        cancel: {
          label: "Cancel",
          className: "btn-default",
          callback: function () {
            self.detected.reject('Could not find "homestead" VM.');
          }
        }
      }
    });

    $('#btnClone').on('click', function() {
      clone_homestead();
    });
    $('#btnSetLoc').on('click', function() {
      set_homestead_location();
    });
  });

  return self.detected.promise;
};

/**
 * Loads configuration file for current VM.
 * 
 * @return {[type]} [description]
 */
Homestead.prototype.loadConfig = function () {
  var self = this;

  // VM must first be detected so we have the home path
  self.detected.promise.then(function () {
    self.config = new GenericSettings(self.home + '/config.yml');

    self.config.load(function (error, data) {
      if (error !== null) {
        self.loadedConfig.reject(error);
        return;
      }

      self.loadedConfig.resolve();
    });
  });

  return self.loadedConfig.promise;
};

/**
 * Checks whether the VM is currently running or not.
 * 
 * @return {[type]} [description]
 */
Homestead.prototype.checkState = function () {
  var self = this;

  // VM must first be detected so we have its ID
  self.detected.promise.then(function () {
    var spawn = require('child_process').spawn;
    var child = spawn('vagrant', ['status', self.id]);

    // save buffer output
    var stdout = '';
    var write = function (buffer) {
      stdout += buffer.toString('utf8');
    };

    child.stdout.on('data', write);
    child.stderr.on('data', write);

    child.on('exit', function (exitCode) {
      if (exitCode !== 0) {
        self.checkedState.reject('Encountered problem while running "vagrant status".');
        return;
      }

      self.state += (stdout.indexOf('running') !== -1) ? self._RUNNING : 0;
      self.stateChange();

      self.checkedState.resolve();
    });
  });

  return self.checkedState.promise;
};

/**
 * Binds event handlers for common actions.
 * 
 * @return {[type]} [description]
 */
Homestead.prototype.bindEvents = function () {
  var self = this;

  $('.homestead-start').off('click');
  $('.homestead-start').click(function (e) {
    e.preventDefault();

    self.start();
  });

  $('.homestead-stop').off('click');
  $('.homestead-stop').click(function (e) {
    e.preventDefault();

    self.stop();
  });

  $('.homestead-provision').off('click');
  $('.homestead-provision').click(function (e) {
    e.preventDefault();

    self.provision();
  });
};

/**
 * Updates UI elements based on current VM state
 * 
 * @return {[type]} [description]
 */
Homestead.prototype.stateChange = function () {
  var self = this;

  // sanity check
  if (self.state < 0) {
    self.state = 0;
  }

  // check running state
  var status_el = $('#nav-' + this.unique_name + ' .title .homestead-status')
  if (self.state & self._RUNNING) {
    $('.homestead-start').addClass('disabled');
    $('.homestead-stop').removeClass('disabled');

    status_el.text('Running');
  }
  else {
    $('.homestead-start').removeClass('disabled');
    $('.homestead-stop').addClass('disabled');
    
    status_el.text('Stopped');
  }

  // check provisioning state
  if (this.state & this._NEEDS_PROVISION) {
    this.showProvisionNotice();
  }
};

/**
 * Starts VM
 * 
 * @return {[type]} [description]
 */
Homestead.prototype.start = function () {
  var self = this;

  if ((self.state & self._RUNNING)) {
    self.control(self.CONTROL_STOP).then(function () {
      console.log('restarting');

      self.state += self._RUNNING;
      self.stateChange();
    });
  } else {
    self.control(self.CONTROL_START).then(function() {
      console.log('starting');

      self.state += self._RUNNING;
      self.stateChange();
    });
  }
};

/**
 * Stops VM
 * 
 * @return {[type]} [description]
 */
Homestead.prototype.stop = function () {
  var self = this;

  if (self.state & self._RUNNING) {
    self.control(self.CONTROL_STOP).then(function () {
      console.log('stopped');

      self.state -= self._RUNNING;
      self.stateChange();
    });
  }
};

/**
 * Provisions VM
 * 
 * @return {[type]} [description]
 */
Homestead.prototype.provision = function () {
  var self = this;

  if (self.state & self._NEEDS_REPROVISION) {
    self.control(self.CONTROL_PROVISION).then(function () {
      console.log('finished provisioning');

      self.state -= self._NEEDS_REPROVISION;
      self.stateChange();

      self.hideProvisionNotice();
    });
  }
};

Homestead.prototype.control = function (action) {
  var deferred = Q.defer();
  var self = this;
  self.controlChain = self.controlChain.then(deferred.promise);

  //var creator_uid_path = this.home + '/.vagrant/machines/homestead/virtualbox/creator_uid';
  //var creator_uid = fs.readFileSync(creator_uid_path);

  //fs.writeFileSync(creator_uid_path, '0');

  var title = '';
  var cmd = '';

  switch (action) {
    case self.CONTROL_START:
      cmd = 'up'
      title = 'Starting VM';
      break;

    case self.CONTROL_STOP:
      cmd = 'halt';
      title = 'Stopping VM';
      break;

    case self.CONTROL_PROVISION:
      cmd = 'provision';
      title = 'Re-provisioning VM';
      break;

    case self.CONTROL_RELOAD:
      cmd = 'reload';
      title = 'Reloading VM';
      break;
  }

  var startDir = process.cwd();
  try {
    process.chdir(self.home);
  } catch (err) {
    console.log('chdir: ' + err);
    deferred.reject('Encountered a problem while running "vagrant ' + cmd + ' ' + self.id + '".');
    return;
  }

  var spawn = require('child_process').spawn;
  var child = spawn('sudo', ['-S', 'vagrant', cmd, 'homestead']);
  //var child = spawn('sudo', ['-S', 'vagrant', cmd, self.id]);

  //console.log('running: vagrant ' + cmd + ' ' + self.id);
  console.log('running: vagrant ' + cmd + ' ' + 'homestead');

  var dialog = load_mod('components/dialog').create(title);
  dialog.setChildProcess(child);
  dialog.logProcess(child);

  child.on('exit', function (exitCode) {
    try {
      process.chdir(startDir);
    } catch (err) {
      console.log('chdir: ' + err);
      return;
    }

    if (exitCode !== 0) {
      deferred.reject('Encountered problem while running "vagrant ' + cmd + ' ' + self.id + '".');
      return;
    }

    switch (action) {
      case self.CONTROL_START:
        if (!(self.state & self._NEEDS_PROVISION)) {
          self.checkState();
          deferred.resolve();

          break;
        }

        self.controlChain = self.controlChain.then(self.control(self.CONTROL_PROVISION));
        deferred.resolve();

        break;

      case self.CONTROL_STOP:
      case self.CONTROL_RELOAD:
        self.checkState();
        deferred.resolve();

        break;

      case self.CONTROL_PROVISION:
        self.hideProvisionNotice();

        self.checkState();
        deferred.resolve();

        break;
    }

    dialog.hide();
  });


  // fs.writeFileSync(creator_uid_path, creator_uid);

  return self.controlChain;
};

module.exports = Homestead;
