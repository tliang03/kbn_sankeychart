import _ from 'lodash';
import AggConfigResult from 'ui/vis/agg_config_result';
import AggResponseSankifyTableProvider from './_table';
import AggResponseSankifyTableGroupProvider from './_sankey_group';
import AggResponseSankifyGetColumnsProvider from './_get_columns';
export default function TabbedAggResponseWriterProvider(Private) {
  let Table = Private(AggResponseSankifyTableProvider);
  let TableGroup = Private(AggResponseSankifyTableGroupProvider);
  let getColumns = Private(AggResponseSankifyGetColumnsProvider);


    _.class(SplitAcr).inherits(AggConfigResult);

    function SplitAcr(agg, parent, key) {
      SplitAcr.Super.call(this, agg, parent, key, key);
    }

    /**
     * Writer class that collects information about an aggregation response and
     * produces a table, or a series of tables.
     *
     * @param {Vis} vis - the vis object to which the aggregation response correlates
     */
    function SankeyAggResponseWriter(vis, opts) {
      this.vis = vis;
      this.opts = opts || {};
      this.rowBuffer = [];

      var visIsHier = vis.isHierarchical();

      // do the options allow for splitting? we will only split if true and
      // tabify calls the split method.
      this.canSplit = this.opts.canSplit !== false;

      // should we allow partial rows to be included in the tables? if a
      // partial row is found, it is filled with empty strings ''
      this.partialRows = this.opts.partialRows == null ? visIsHier : this.opts.partialRows;

      // if true, we will not place metric columns after every bucket
      // even if the vis is hierarchical. if false, and the vis is
      // hierarchical, then we will display metric columns after
      // every bucket col
      this.minimalColumns = visIsHier ? !!this.opts.minimalColumns : true;

      // true if we can expect metrics to have been calculated
      // for every bucket
      this.metricsForAllBuckets = visIsHier;

      // if true, values will be wrapped in aggConfigResult objects which link them
      // to their aggConfig and enable the filterbar and tooltip formatters
      this.asAggConfigResults = !!this.opts.asAggConfigResults;

      this.columns = getColumns(vis, this.minimalColumns);
      this.aggStack = _.pluck(this.columns, 'aggConfig');

      this.root = new TableGroup();
      this.acrStack = [];
      this.splitStack = [this.root];
    }

    /**
     * Create a Table of TableGroup object, link it to it's parent (if any), and determine if
     * it's the root
     *
     * @param  {boolean} group - is this a TableGroup or just a normal Table
     * @param  {AggConfig} agg - the aggregation that create this table, only applies to groups
     * @param  {any} key - the bucketKey that this table relates to
     * @return {Table/TableGroup} table - the created table
     */
    SankeyAggResponseWriter.prototype._table = function(group, agg, key) {
      var Class = (group) ? TableGroup : Table;
      var table = new Class();
      var parent = this.splitStack[0];

      if (group) {
        table.aggConfig = agg;
        table.key = key;
        table.title = agg.makeLabel() + ': ' + (table.fieldFormatter()(key));
      }

      // link the parent and child
      table.$parent = parent;
      parent.tables.push(table);

      return table;
    };

    /**
     * Enter into a split table, called for each bucket of a splitting agg. The new table
     * is either created or located using the agg and key arguments, and then the block is
     * executed with the table as it's this context. Within this function, you should
     * walk into the remaining branches and end up writing some rows to the table.
     *
     * @param  {aggConfig} agg - the aggConfig that created this split
     * @param  {Buckets} buckets - the buckets produces by the agg
     * @param  {function} block - a function to execute for each sub bucket
     */
    SankeyAggResponseWriter.prototype.split = function(agg, buckets, block) {
      var self = this;

      if (!self.canSplit) {
        throw new Error('attempted to split when splitting is disabled');
      }

      self._removeAggFromColumns(agg);

      buckets.forEach(function(bucket, key) {
        // find the existing split that we should extend
        var tableGroup = _.find(self.splitStack[0].tables, {
          aggConfig: agg,
          key: key
        });
        // create the split if it doesn't exist yet
        if (!tableGroup) tableGroup = self._table(true, agg, key);

        var splitAcr = false;
        if (self.asAggConfigResults) {
          splitAcr = self._injectParentSplit(agg, key);
        }

        // push the split onto the stack so that it will receive written tables
        self.splitStack.unshift(tableGroup);

        // call the block
        if (_.isFunction(block)) block.call(self, bucket, key);

        // remove the split from the stack
        self.splitStack.shift();
        splitAcr && _.pull(self.acrStack, splitAcr);
      });
    };

    SankeyAggResponseWriter.prototype._removeAggFromColumns = function(agg) {
      var i = _.findIndex(this.columns, function(col) {
        return col.aggConfig === agg;
      });

      // we must have already removed this column
      if (i === -1) return;

      this.columns.splice(i, 1);

      if (this.minimalColumns) return;

      // hierarchical vis creats additional columns for each bucket
      // we will remove those too
      var mCol = this.columns.splice(i, 1).pop();
      var mI = _.findIndex(this.aggStack, function(agg) {
        return agg === mCol.aggConfig;
      });

      if (mI > -1) this.aggStack.splice(mI, 1);
    };

    /**
     * When a split is found while building the aggConfigResult tree, we
     * want to push the split into the tree at another point. Since each
     * branch in the tree is a double-linked list we need do some special
     * shit to pull this off.
     *
     * @private
     * @param {AggConfig} - The agg which produced the split bucket
     * @param {any} - The value which identifies the bucket
     * @return {SplitAcr} - the AggConfigResult created for the split bucket
     */
    SankeyAggResponseWriter.prototype._injectParentSplit = function(agg, key) {
      var oldList = this.acrStack;
      var newList = this.acrStack = [];

      // walk from right to left through the old stack
      // and move things to the new stack
      var injected = false;

      if (!oldList.length) {
        injected = new SplitAcr(agg, null, key);
        newList.unshift(injected);
        return injected;
      }

      // walk from right to left, emptying the previous list
      while (oldList.length) {
        var acr = oldList.pop();

        // ignore other splits
        if (acr instanceof SplitAcr) {
          newList.unshift(acr);
          continue;
        }

        // inject the split
        if (!injected) {
          injected = new SplitAcr(agg, newList[0], key);
          newList.unshift(injected);
        }

        var newAcr = new AggConfigResult(acr.aggConfig, newList[0], acr.value, acr.aggConfig.getKey(acr));
        newList.unshift(newAcr);

        // and replace the acr in the row buffer if its there
        var rowI = this.rowBuffer.indexOf(acr);
        if (rowI > -1) {
          this.rowBuffer[rowI] = newAcr;
        }
      }

      return injected;
    };

    /**
     * Push a value into the row, then run a block. Once the block is
     * complete the value is pulled from the stack.
     *
     * @param  {any} value - the value that should be added to the row
     * @param  {function} block - the function to run while this value is in the row
     * @return {any} - the value that was added
     */
    SankeyAggResponseWriter.prototype.cell = function(agg, value, block) {
      if (this.asAggConfigResults) {
        value = new AggConfigResult(agg, this.acrStack[0], value, value);
      }

      var staskResult = this.asAggConfigResults && value.type === 'bucket';

      this.rowBuffer.push(value);
      if (staskResult) this.acrStack.unshift(value);

      if (_.isFunction(block)) block.call(this);

      this.rowBuffer.pop(value);
      if (staskResult) this.acrStack.shift();

      return value;
    };

    /**
     * Create a new row by reading the row buffer. This will do nothing if
     * the row is incomplete and the vis this data came from is NOT flagged as
     * hierarchical.
     *
     * @param  {array} [buffer] - optional buffer to use in place of the stored rowBuffer
     * @return {undefined}
     */
    SankeyAggResponseWriter.prototype.row = function(buffer) {
      var cells = buffer || this.rowBuffer.slice(0);

      if (!this.partialRows && cells.length < this.columns.length) {
        return;
      }

      var split = this.splitStack[0];
      var table = split.tables[0] || this._table(false);

      while (cells.length < this.columns.length) cells.push('');
      table.rows.push(cells);
      return table;
    };

    /**
     * Get the actual response
     *
     * @return {object} - the final table-tree
     */
    SankeyAggResponseWriter.prototype.response = function() {
      var columns = this.columns;

      // give the columns some metadata
      columns.map(function(col) {
        col.title = col.aggConfig.makeLabel();
      });

      this.root.aggConfig = columns[0].aggConfig;
      this.root.title = columns[0].title;

      this._createSankeyArray(columns);
      delete this.root.tables;

      if (this.canSplit) return this.root;

      var sankey = this.root.sankey[0];
      if (!sankey) return;

      delete table.$parent;
      return table;
    };

    SankeyAggResponseWriter.prototype._createNode = function(table, value, rootNode) {
      if (table.title && typeof table.title !== 'function') {
        var sankey = {};
        sankey.value = value;
        sankey.table = table;
        var key = table.key ? table.key : table.title;
        sankey.name = key.toString();
        if (rootNode) {
          sankey.rootNode = rootNode;
          sankey.fieldLabel = table.title;
        } else {
          var formatter = table.fieldFormatter();
          sankey.fieldLabel = formatter(table.key);
        }
        sankey.label = table.aggConfig.makeLabel();

        return sankey;
      }
      return null;
    };

    SankeyAggResponseWriter.prototype._createLink = function(sourceIndex, value, parent, index) {
      var link = {};
      link.value = value;
      if (this.vis.params && this.vis.params.isFlip) {
        link.source = sourceIndex;
      } else {
        link.target = sourceIndex;
      }

      link.parent = parent;
      link.index = index;
      return link;
    };

    SankeyAggResponseWriter.prototype._fillParentsIndex = function(links, nodes, index) {
      var self = this;
      links.forEach(function(link) {
        var parent = link.parent;
        nodes.some(function(node, i) {
          var isSameObj = true;
          if (node.rootNode) {
            for (var prop in node.rootNode) {
              if (isSameObj && prop !== 'value') {
                isSameObj = (node.rootNode[prop] === parent[prop]);
              }
            }
          } else {
            for (var prop in node.table) {
              if (isSameObj && prop !== 'value') {
                isSameObj = (node.table[prop] === parent[prop]);
              }
            }
          }

          if (isSameObj) {
            if (self.vis.params && self.vis.params.isFlip) {
              link.target = i;
            } else {
              link.source = i;
            }
            return true;
          }
        });
        if (typeof link.source !== 'number') {
          if (self.vis.params && self.vis.params.isFlip) {
            link.target = nodes.length - 1;
          } else {
            link.source = nodes.length - 1;
          }
        }
      });
    };

    SankeyAggResponseWriter.prototype._createSankeyArray = function(columns) {
      var nodes = [];
      var links = [];
      var self = this;
      columns.forEach(function(column, index) {
        var value = 0;

        (function step(table) {
          if (table.tables) {
            var count = 0;
            table.tables.forEach(function(child) {
              var currentValue = 0;
              if (child.tables) {

                currentValue = step(child);
                count += currentValue;
                var topParent = self.columns[index];
                if (currentValue) {
                  var node = self._createNode(child, currentValue);
                  nodes.push(node);
                  var nodeIndex = nodes.length - 1;
                  var parent = child.$parent;
                  var link = self._createLink(nodeIndex, currentValue, parent, index);

                  links.push(link);
                }
              } else {
                currentValue = child.rows[0][index];
                count += currentValue;

                value += currentValue;
              }
            });
          }
          return count;
        }(self.root));
        var node = self._createNode(column, value, self.root);
        nodes.push(node);

        self._fillParentsIndex(links, nodes, index);
      });
      var sankey = {};
      sankey.nodes = nodes;
      sankey.links = links;
      this.root.sankey = sankey;
    }

    return SankeyAggResponseWriter;
};