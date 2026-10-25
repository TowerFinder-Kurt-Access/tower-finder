import { chromium } from 'playwright';
import fs from 'node:fs';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
await p.route('**/maplibre-gl-worker.mjs', async r => {
  await r.fulfill({ status:200, contentType:'application/javascript', body: fs.readFileSync('public/maplibre-gl-worker.mjs') });
});
await p.goto('data:text/html,<html><body style="margin:0"><div id="m" style="width:100vw;height:100vh"></div></body></html>');

const out = await p.evaluate(async () => {
  const ml = await import('https://esm.sh/maplibre-gl@6.15.0');
  ml.setWorkerUrl('http://127.0.0.1:9999/maplibre-gl-worker.mjs');
  const style = { version:8, glyphs:'https://tiles.basemaps.cartocdn.com/v/20261001-03/fonts/{fontstack}/{range}.pbf',
    sources:{pts:{type:'geojson',data:{type:'FeatureCollection',features:[
      {type:'Feature',properties:{},geometry:{type:'Point',coordinates:[-123,49.5]}},
      {type:'Feature',properties:{},geometry:{type:'Point',coordinates:[-123.01,49.51]}},
      {type:'Feature',properties:{},geometry:{type:'Point',coordinates:[-123.02,49.49]}},
    ]},cluster:true,clusterMaxZoom:18,clusterRadius:50}},
    layers:[{id:'bg',type:'background',paint:{'background-color':'#eee'}},
      {id:'cl',type:'circle',source:'pts',filter:['has','point_count'],paint:{'circle-color':'#f44','circle-radius':20}}] };
  const map = new ml.Map({ container:'m', style, center:[-123,49.5], zoom:5, maxZoom:18 });
  await new Promise(r=>map.on('load',r));
  await new Promise(r=>setTimeout(r,1500));

  // Read the cluster's expansion zoom, then run the exact easeTo the component uses.
  const src = map.getSource('pts');
  const feats = map.querySourceFeatures('pts', { filter: ['has','point_count'] });
  const clusterId = feats[0].properties.cluster_id;
  const expansion = await src.getClusterExpansionZoom(clusterId);
  const startZoom = map.getZoom();
  const targetZoom = Math.max(startZoom + 1, expansion);

  const samples = [];
  const t0 = performance.now();
  map.easeTo({ center:[-123,49.5], zoom: Math.min(targetZoom, map.getMaxZoom()), duration: 650,
    easing: (t) => 1 - Math.pow(1 - t, 3) });
  for (let i=0;i<6;i++) {
    await new Promise(r=>setTimeout(r,120));
    samples.push({ t: Math.round(performance.now()-t0), zoom: +map.getZoom().toFixed(2) });
  }
  await new Promise(r=>setTimeout(r,900));
  return { startZoom, expansionZoom: expansion, targetZoom, samples, finalZoom: +map.getZoom().toFixed(2) };
});
console.log(JSON.stringify(out, null, 1));
await b.close();
