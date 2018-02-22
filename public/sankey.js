define(function (require) {
  
  // we need to load the css ourselves
  require('plugins/sankey/sankey.less');

  // we also need to load the controller and used by the template
  require('plugins/sankey/sankey_ctrl');

  // register the provider with the visTypes registry
  require('ui/registry/vis_types').register(MetricVisProvider);


  function MetricVisProvider(Private) {
    var TemplateVisType = Private(require('ui/template_vis_type/template_vis_type'));
    var Schemas = Private(require('ui/vis/schemas'));

    // return the visType object, which kibana will use to display and configure new
    // Vis object of this type.
    return new TemplateVisType({
      name: 'sankey',
      title: 'Sankey chart',
      icon: 'fa-align-left',
      description: 'Sankey diagrams visualize the magnitude of flow between nodes in a network.',
      template: require('plugins/sankey/sankey.html'),
      params: {
        defaults: {
          isFlip: false
        },
        editor: require('plugins/sankey/sankey_params.html'),
        legendPositions: [{
          value: 'left',
          text: 'left',
        }, {
          value: 'right',
          text: 'right',
        }, {
          value: 'top',
          text: 'top',
        }, {
          value: 'bottom',
          text: 'bottom',
        }]
      },
      responseConverter: false,
      hierarchicalData: false,
      implementsRenderComplete: true,
      schemas: new Schemas([{
        group: 'metrics',
        name: 'metric',
        title: 'Metric',
        min: 1,
        max: 1,
        defaults: [{
          type: 'count',
          schema: 'metric'
        }]
      }, {
        group: 'buckets',
        name: 'split',
        title: 'Sankey Funnel Level'
      }])
    });
  }

  // export the provider so that the visType can be required with Private()
  return MetricVisProvider;
});
