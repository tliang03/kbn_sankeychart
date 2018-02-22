import _ from 'lodash';

import VislibComponentsLabelsUniqLabelsProvider from 'ui/vislib/components/labels/uniq_labels';
import VislibComponentsColorColorProvider from 'ui/vislib/components/color/color';
import uiModules from 'ui/modules';
import errors from 'ui/errors'; 
import VislibProvider from 'ui/vislib';
import SankifyProvider from './sankify/sankify'

define(function (require) {

  const d3 = require('d3');
  const d3Sankey = require('d3-sankey');

  var module = uiModules.get('kibana/vr_vis', ['kibana']);

  module.controller('SankeyController', function($scope, $rootScope, $element, Private) {
    const Sankify = Private(SankifyProvider);
    const color = Private(VislibComponentsColorColorProvider);

    let data = null;
    let response = null;
    let metricTitle = '';
    let formatNumber = d3.format(",.0f");
    let w = null;
    let h = null;
    let format = function(d) {
      return formatNumber(d);
    };
    let aggsLength = 0;

    $scope.draw = function(data) {
      if(!data) return;
      let el = d3.select('.chartsankey');
      el.selectAll('*').remove();

      let width = $('.sankey-sg').closest('div.visualize-chart').width() - 20;
      let height = $('.sankey-sg').closest('div.visualize-chart').height() - 20;
      w = width;
      h = height;
      
      if(width <=0 || height <=0 ) return;
      

      let svg = el.append('svg')
        .attr('width', width)
        .attr('height', height)
        .append('g');

      let sankey = d3Sankey.sankey()
        .nodeWidth(15)
        .nodePadding(10)
        .size([width, height]);

      if (data.nodes.length > 2) {
        sankey
          .nodes(data.nodes)
          .links(data.links)
          .layout(32);
      }
      $scope.addNode(svg, sankey, width, height, data.nodes);

      $scope.addLink(svg, sankey, width, height, data.links);

      aggsLength = $scope.vis.aggs ? $scope.vis.aggs.length : 0;

      return svg;
    };

    $scope.addLink = function(svg, sankey, width, height, linkData) {
      let path = sankey.link();

      let link = svg.append("g").selectAll(".sankey_link")
        .data(linkData)
        .enter().append("path")
        .attr("class", "sankey_link")
        .attr("d", path)
        .style("stroke-width",
          function(d) {
            return Math.max(1, d.dy);
          })
        .sort(function(a, b) {
          return b.dy - a.dy;
        });

      link.append("title")
        .text(function(d) {
          return d.source.fieldLabel + " → " + d.target.fieldLabel + "\n"
        });

      return link;
    };

    $scope.addNode = function(svg, sankey, width, height, nodesData) {

      let colorFunc = getSankeyColorFunc(nodesData);

      let node = svg.append("g").selectAll(".sankey_node")
        .data(nodesData)
        .enter().append("g")
        .attr("class", "sankey_node")
        .attr("transform",
          function(d) {
            if (nodesData.length > 1) {
              return "translate(" + d.x + "," + d.y + ")";
            } else {
              return "translate(" + width / 2 + "," + 10 + ")";
            }
          });


      node.append("rect")
        .attr("height", function(d) {
          if (nodesData.length > 1) {
            return d.dy;
          } else {
            let h = $('.chartsankey').height();
            return h - 20;
          }
        })
        .attr("width", sankey.nodeWidth())
        .style("fill", function(d) {
          return d.color = colorFunc(d.name);
        })
        .style("stroke", function(d) {
          return d3.rgb(d.color).darker(2);
        })
        .append("title")
        .text(function(d) {
          let subLevels = '';
          return d.label + ' : ' + d.fieldLabel + "\n" +
            metricTitle + ' : ' + format(d.value);
        });

      node.append("text")
        .attr("x", -6)
        .attr("y", function(d) {
          if (nodesData.length > 1) {
            return d.dy / 2;
          } else {
            let h = $('.chartsankey').height();
            return h / 2 - 10;
          }
        })
        .attr("dy", ".35em")
        .attr("text-anchor", "end")
        .attr("transform", null)
        .text(function(d) {
          return d.fieldLabel + ":" + format(d.value);
        })
        .filter(function(d) {
          if ($scope.vis.params.isFlip) {
            return d.x < width / 2;
          }
          return d.x < width / 4;
        })
        .attr("x", 6 + sankey.nodeWidth())
        .attr("text-anchor", "start");
      return node;

    };

    // Get query results ElasticSearch
    $scope.$watch('esResponse', function (resp) {
      const vis = $scope.vis;
      _renderChart(vis, resp);
    });

    $scope.$watch("esResp", function(resp) {
      const vis = $scope.vis;
      _renderChart(vis, resp);
    });

    $scope.$watch('vis.params', function (resp) {
      if(!response) return;
      var l = $scope.vis.aggs ? $scope.vis.aggs.length : 0;
      if(aggsLength !== l) return;  
      _generateSankeyData($scope.vis, response);
      if (!data) return;
      $scope.draw(data.sankey);
    });

    // Automatic resizing of graphics
    $scope.$watch(
      function () {
        if (!data) return;
        let width = $('.sankey-sg').closest('div.visualize-chart').width() - 20;
        let height = $('.sankey-sg').closest('div.visualize-chart').height() - 20;

        if(w === width && h === height) return;

        $scope.draw(data.sankey);     
      }, 
      true
    );

    function _renderChart(vis, resp) {
      if (resp && resp.hits.total) {
        response = resp; 
        data = {};
        _generateSankeyData(vis, resp);
                  
        if (!data) return;
        $scope.draw(data.sankey);
      } else {
        data = null;
      }
    };

    function _generateSankeyData(vis, resp) {
      data = Sankify(vis, resp);
    };

    function getSankeyColorFunc(datas) {
      var uiState = $scope.vis.getUiState();
      return color(_getSankeyNames(datas), uiState.get('vis.colors'));
    };

    function _getSankeyNames(data) {
      var names = [];
      data.forEach(function(obj) {
        names.push(obj.name)
      });
      return names;
    };

  })
});
