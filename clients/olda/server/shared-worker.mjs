import shared from '../../../worker/index.mjs';
export default {
  async fetch(request,env,ctx) {
    if(new URL(request.url).pathname==='/api/presentation'&&request.method==='GET') {
      let value;try{value=JSON.parse(env.OLDA_PRESENTATION||'{}');}catch{value={};}
      const profile={};for(const key of ['name','salutation','dedication','signature'])if(typeof value[key]==='string')profile[key]=value[key].slice(0,4000);
      return Response.json({profile},{headers:{'Cache-Control':'no-store','Cross-Origin-Resource-Policy':'same-origin','X-Content-Type-Options':'nosniff'}});
    }
    const response=await shared.fetch(request,{...env,OLDA_DIARY:'olda',OLDA_PUBLIC_DIARY:'olda'},ctx);
    const secured=new Response(response.body,response);
    secured.headers.set('X-Robots-Tag','noindex, nofollow');
    secured.headers.set('X-Content-Type-Options','nosniff');
    secured.headers.set('Referrer-Policy','same-origin');
    secured.headers.set('X-Frame-Options','DENY');
    return secured;
  }
};
