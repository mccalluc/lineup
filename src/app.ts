/**
 * Created by sam on 04.11.2016.
 */

import {create as createHeader, AppHeaderLink} from 'phovea_ui/src/header';

import {deriveColors} from 'lineupjs/src/utils';
import {extent, dsv} from 'd3';
import datasets, {IDataSetSpec} from './datasets';
import {load as loadGist, save as saveToGist} from './gist';
import exportToCSV, {exportToJSON} from './export';
import importFile from './importer';
import {initImporter} from './importer';
import Taggle from 'lineupjs/src/ui/taggle';
import {LocalDataProvider} from 'lineupjs/src/provider';
import {IStratification, matrixSplicer} from './taggle/splicer';

interface IDataSet {
  name: string;
  url: string;
  dump: any;
}

function fixMissing(columns, data) {
  columns.forEach((col) => {
    if (col.type === 'number' && !col.domain) {
      const old = col.domain || [NaN, NaN];
      const minmax = extent(data, (row) => {
        return row[col.column].length === 0 ? undefined : +(row[col.column]);
      });
      col.domain = [
        isNaN(old[0]) ? minmax[0] : old[0],
        isNaN(old[1]) ? minmax[1] : old[1]
      ];
    } else if (col.type === 'categorical' && !col.categories) {
      const sset = new Set(data.map((row) => row[col.column]));
      col.categories = Array.from(sset).sort();
    }
  });
}


export function initTaggle(name: string, desc: any, _data: any[], stratifications: IStratification[], taggle?: Taggle) {
  document.querySelector('[data-header="appLink"]').innerHTML = 'Taggle &mdash; '+name;
  document.title = 'Taggle - ' + name;
  fixMissing(desc.columns, _data);
  const provider = new LocalDataProvider(_data, deriveColors(desc.columns), {
    maxNestedSortingCriteria: Infinity,
    maxGroupColumns: Infinity,
    filterGlobally: true
  });
  if (taggle) {
    taggle.changeDataStorage(provider, desc);
  } else {
    provider.restore(desc);
    taggle = new Taggle(document.getElementById('app'), provider, {
      header: {
        summaries: {
          'numbers': matrixSplicer(stratifications)
        }
      }
    });
  }
  provider.deriveDefault();
  taggle.update();

  //sort by stacked columns
  const cols = provider.getRankings();
  cols.forEach((rankCol) => {
    rankCol.children.forEach((col) => {
      if (col.desc.type === 'stack') {
        col.sortByMe();
      }
    });
  });
  return taggle;
}

export let taggle: Taggle = null;
{
  const header = createHeader(
    <HTMLElement>document.querySelector('#caleydoHeader'),
    {appLink: new AppHeaderLink('LineUp')}
  );

  header.addRightMenu(`<span title="Download CSV"><i class="fa fa-download"></i><sub class="fa fa-file-excel-o"></sub></span>`, () => {
    if (taggle) {
      exportToCSV(taggle.data, document.title);
    }
  });
  header.addRightMenu(`<span title="Download JSON"><i class="fa fa-download"></i><sub class="fa fa-file-code-o"></sub></span>`, () => {
    if (taggle) {
      exportToJSON(taggle, document.title);
    }
  });
  header.addRightMenu(`<span title="Upload to Github Gist"><i class="fa fa-cloud-upload"></i><sub class="fa fa-github"></sub></span>`, () => {
    if (taggle) {
      saveToGist(taggle, document.title);
    }
  });
  header.rightMenu.insertBefore(document.getElementById('datasetSelector'), header.rightMenu.firstChild);
  header.addRightMenu(`<span title="Upload CSV/JSON"><i class="fa fa-upload"></i><sub><i class="fa fa-file-excel-o"></i><i class="fa fa-file-code-o"></i></sub></span>`, () => {
    importFile().then(({name, desc, data}) => {
      taggle = initTaggle(name, desc, data, [], taggle);
      header.ready();
    }).catch(() => {
      // aborted ok
    });
  });

  initImporter();

  const loadDataset = (dataset: IDataSetSpec) => {
    const desc = dataset.desc;
    const file = dataset.url;
    header.wait();
    if (typeof file === 'string') {
      dsv(desc.separator || '\t', 'text/plain')(file, (_data) => {
        taggle = initTaggle(dataset.name, desc, _data, dataset.stratifications || [], taggle);
        header.ready();
      });
    } else {
      file().then((_data) => {
        taggle = initTaggle(dataset.name, desc, _data, dataset.stratifications || [], taggle);
        header.ready();
      });
    }
  };

  {
    const base = <HTMLElement>document.querySelector('#datasetSelector ul');
    datasets.forEach((d) => {
      const li = document.createElement('li');
      li.innerHTML = `<a href="#${d.id}">${d.name}</a>`;
      li.firstElementChild.addEventListener('click', (event) => {
        loadDataset(d);
      });
      base.appendChild(li);
    });
  }
  const old = history.state ? history.state.id : (window.location.hash ? window.location.hash.substr(1) : '');
  if (old.match(/gist:.*/)) {
    const gist = old.substr(5);
    loadGist(gist).then(({name, desc, data}) => {
      taggle = initTaggle(name, desc, data, [], taggle);
      header.ready();
    });
  } else {
    const choose = datasets.filter((d) => d.id === old);
    if (choose.length > 0) {
      loadDataset(choose[0]);
    } else {
      loadDataset(datasets[0]);
    }
  }
}
