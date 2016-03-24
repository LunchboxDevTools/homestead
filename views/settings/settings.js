$(document).ready(function () {
  console.log('loaded settings.js in Homestead plugin');

  var homestead = window.active_plugin;
  var vm_config = homestead.config;

  // populate settings vm form
  var vagrant_path = $("input[name=vagrant_path");
  vagrant_path.val(homestead.plugin.settings.vagrant_path);

  var vagrant_ip = $("input[name=vagrant_ip]");
  vagrant_ip.val(vm_config.ip);

  var vagrant_hostname = $("input[name=vagrant_hostname]");
  vagrant_hostname.val(vm_config.sites[0].map);

  var vagrant_synced_folders = $("input[name=vagrant_synced_folders]");
  vagrant_synced_folders.val(vm_config.folders[0].map);
  
  var vagrant_memory = $("input[name=vagrant_memory]");
  vagrant_memory.val(vm_config.memory);
  
  var vagrant_cpus = $("input[name=vagrant_cpus]");
  vagrant_cpus.val(vm_config.cpus);

  // setup filesync method widget & activate selected item
  var filesync_wrap = $('#filesync_method');
  if (filesync_wrap) {
    var filesync = vm_config.folders[0].type;
    if (!filesync) {
      filesync = 'default';
    }

    setFilesync(filesync);
    function setFilesync(value) {
      filesync_wrap.find('label').removeClass('active');
      filesync_wrap.find('label input[type=radio]').removeAttr('checked');

      var input = filesync_wrap.find('label input[type=radio][value=' + value + ']');
      input.attr('checked', 'checked');
      input.parent().addClass('active');
    }

    filesync_wrap.find('label').each(function (i, label) {
      label = $(label);
      label.click(function (e) {
        e.preventDefault();

        setFilesync(label.find('input[type=radio]').attr('value'));
      });
    });
  }

  // populate installed extras form
  var extras = $('#installed_extras');
  extras.find('input[name=installed_extras]').removeAttr('checked'); // reset
  if (vm_config.installed_extras) {
    vm_config.installed_extras.forEach(function (item) {
      extras.find('input[type=checkbox][value=' + item + ']').attr('checked', 'checked');
    });
  }

  // callback for use with save() ops;
  var save_callback = function (error, data) {
    if (error !== null) {
      return;
    }

    // reload view & show notice
    reloadCurrentView(function (error) {
      homestead.showProvisionNotice();
    });
  };

  // form actions
  $('#save_settings').click(function (e) {
    e.preventDefault();

    // set general vagrant info
    homestead.plugin.settings.vagrant_path = vagrant_path.val();
    vm_config.ip = vagrant_ip.val();
    vm_config.sites[0].map = vagrant_hostname.val();
    vm_config.folders[0].map = vagrant_synced_folders.val();
    vm_config.memory = vagrant_memory.val();
    vm_config.cpus = vagrant_cpus.val();

    // set synced folders
    var synced_folders = $('input[name=filesync_method]:checked').val();
    if (synced_folders == 'default') {
      synced_folders = '';
    }

    vm_config.folders[0].type = synced_folders;

    // set installed extras
    vm_config.installed_extras = [];
    $('input[name=installed_extras]:checked').each(function (i, item) {
      item = $(item);
      vm_config.installed_extras.push(item.val());
    });

    // save
    vm_config.save(save_callback);
    window.lunchbox.settings.save();
  });

  $('#reset_settings').click(function (e) {
    e.preventDefault();

    bootbox.confirm('Reset all settings?', function (result) {
      if (result) {
        // reset config object & save
        vm_config = new GenericSettings(homestead.settings.vm.home + '/example.config.yml');
        vm_config.load(function (error, data) {
          if (error === null) {
            vm_config.save(save_callback);
          }
        });
      }
    });
  });
});
