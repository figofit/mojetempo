import './vendor/leaflet/leaflet.js';
let map;
export function destroyMap(){map?.remove();map=null;}
/** The map is deliberately secondary and loads tiles only after an explicit click. */
export function showMap(element,entries) {
  destroyMap();
  const places=entries.filter(entry=>entry.location);
  map=L.map(element,{scrollWheelZoom:false});
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',maxZoom:19}).addTo(map);
  const points=[];
  for(const entry of places) {
    const place=entry.location,point=[place.latitude,place.longitude];points.push(point);
    const popup=document.createElement('div');
    const title=document.createElement('strong');title.textContent=place.name;popup.append(title);
    const detail=document.createElement('p');detail.textContent=`${entry.date} · ${entry.title||'Aktivita'}${entry.distance?' · '+entry.distance+' km':''}${entry.elevation?' · ↑ '+entry.elevation+' m':''}`;popup.append(detail);
    L.circleMarker(point,{radius:7,color:'#176b5b',fillColor:'#c5edb3',fillOpacity:1,weight:2}).addTo(map).bindPopup(popup);
  }
  if(points.length)map.fitBounds(L.latLngBounds(points).pad(0.2),{maxZoom:13});else map.setView([49.8,15.5],7);
  return points.length;
}
export async function searchPlaces(query) {
  if(query.trim().length<3)throw new Error('Napiš alespoň 3 znaky názvu místa.');
  const url=new URL('https://photon.komoot.io/api/');url.searchParams.set('q',query.trim());url.searchParams.set('limit','5');
  let response;
  try {response=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(10000)});}
  catch {throw new Error('Vyhledávání míst teď není dostupné. Použij aktuální polohu nebo souřadnice.');}
  if(!response.ok)throw new Error('Vyhledávání míst teď není dostupné. Použij aktuální polohu nebo souřadnice.');
  const data=await response.json();
  return (data.features||[]).filter(feature=>feature.geometry?.type==='Point').map(feature=>{
    const p=feature.properties||{};
    return {name:[p.name,p.city,p.country].filter(Boolean).filter((value,i,items)=>items.indexOf(value)===i).join(', ').slice(0,200),latitude:feature.geometry.coordinates[1],longitude:feature.geometry.coordinates[0]};
  }).filter(place=>place.name&&Number.isFinite(place.latitude)&&Number.isFinite(place.longitude)&&Math.abs(place.latitude)<=90&&Math.abs(place.longitude)<=180);
}
