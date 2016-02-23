var settings = null;

$(document).ready(function () {
  console.log('loaded dashboard.js in Homestead plugin');

  var homestead = window.active_plugin;

  // updates UI depending on state
  homestead.stateChange();

  // vm-controling actions
  homestead.bindEvents();

  settings = window.lunchbox;

  // check if there is a list of dependencies
  // and build the table out of it if it's there
  var dependencies = window.lunchbox_homestead_plugin ? window.lunchbox_homestead_plugin.dependencies : null;
  if (dependencies) {
    var tbody = $('<tbody>');
    for (var i in dependencies) {
      tbody.append(getDependencyRow(dependencies[i]));
    }
    $('#versionsTable').append(tbody);
    // window.lunchbox_homestead_plugin.dependencies = undefined;
  }

  function getDependencyRow(dependency) {
    var th = $('<th>', { scope: 'row' });
    var td = $('<td>');

    if (dependency.error) {
      // Make the name of the dependency a link to resources
      var link = $('<a href="#">' + dependency.name + '</a>');
      link.click(function() {
        displayDependencyInformation(dependency);
      });
      th.append(link);

      // Output the required version and any errors
      td.text('Minimum required version: ' + dependency.version);
      td.append('<p>' + dependency.error + '</p>');
    } else {
      th.text(dependency.name);
      td.append('Current version (as determined by <em>' + dependency.command + '</em>):');
      td.append('<p>' + dependency.found_version + '</p>');
    }

    var row = $('<tr>');
    row.append(th);
    row.append(td);
    return row;
  }

  function displayDependencyInformation(dependency) {
    var name = dependency.name;
    var help;
    if (dependency.help) {
      help = dependency.help;
      // need to loop through the help if it is an object
      if ($.type(help) === 'object') {
        var tmp = '';
        $.each(help, function(key, val1) {
          tmp += '<strong>' + key + '</strong>';

          // if the object property is an array, loop through it
          // and concatenate each element to the help text
          if ($.type(val1) === 'array') {
            tmp += '<ul><li>';
            $.each(val1, function(index, val2) {
              tmp += val2 + ' ';
            });
            tmp += '</li></ul>';
          } else {

            // not an array, so just add it to the help text
            tmp += '<ul><li>' + val1 + '</li></ul>';
          }
        });

        // replace the object with the new string
        help = tmp;
      }

      // regardless of help's original type, add required version before text
      help = "Please install version " + dependency.version + " of " + dependency.name + '<br/>' + help;
    } else {

      // help information does not exist, just display required version
      help = "Please install version " + dependency.version + " of " + dependency.name;
    }
    bootbox.dialog({
      title: name,
      message: help
    });
  }
});
