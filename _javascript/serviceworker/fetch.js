self.addEventListener( "fetch", event => {
  
  // console.log( "WORKER: fetch event in progress." );
  
  const request = event.request,
        url = request.url,
        save_data = request.headers.get("save-data");
  
  if ( request.method !== "GET" || shouldBeIgnored( url ) )
  {
    // console.log( "ignoring " + url );
    return;
  }

  // console.log(request.url, request.headers);
  
  // JSON
  if ( /\.json$/.test( url ) )
  {
    event.respondWith(
      fetch( request )
    );
  }

  // HTML
  else if ( request.headers.get("Accept").includes("text/html") )
  {
  
    // notebook entries - cache first, then network (posts will be saved for offline individually), offline fallback
    if ( sw_caches.posts.path.test( url ) )
    {
      event.respondWith(
        caches.match( request )
          .then( cached_result => {
            // cached first
            if ( cached_result )
            {
              // Update the cache in the background, but only if we’re not trying to save data
              if ( ! save_data )
              {
                event.waitUntil(
                  refreshCachedCopy( request, sw_caches.posts.name )
                );
              }
              return cached_result;
            }
            // fallback to network
            return fetch( request )
              // fallback to offline page
              .catch(
                respondWithOfflinePage
              );
          })
      );
    }

    // all other pages - check the cache first, then network, cache reponse, offline fallback
    else
    {
      event.respondWith(
        // check the cache first
        caches.match( request )
          .then( cached_result => {
            if ( cached_result )
            {
              // Update the cache in the background, but only if we’re not trying to save data
              if ( ! save_data )
              {
                event.waitUntil(
                  refreshCachedCopy( request, sw_caches.pages.name )
                );
              }
              return cached_result;
            }
            // fallback to network, but cache the result
            return fetch( request )
              .then( response => {
                const copy = response.clone();
                event.waitUntil(
                  saveToCache( "pages", request, copy )
                ); // end waitUntil
                return response;
              })
              // fallback to offline page
              .catch(
                respondWithOfflinePage
              );
          })
      );
    }
  }

  // images - cache first, then determine if we should request form the network & cache, fallbacks
  else if ( request.headers.get("Accept").includes("image") )
  {
    event.respondWith(
      // check the cache first
      caches.match( request )
        .then( cached_result => {
          if ( cached_result )
          {
            return cached_result;
          }

          // high priority imagery
          if ( isHighPriority( url ) )
          {
            return fetch( request, fetch_config.images )
              .then( response => {
                const copy = response.clone();
                event.waitUntil(
                  saveToCache( "images", request, copy )
                ); // end waitUntil
                return response;
              })
              .catch(
                respondWithOfflineImage
              );
          }
          // all others
          else
          {
            // console.log('other images', url);
            // save data?
            if ( save_data )
            {
              // console.log('saving data, responding with fallback');
              return respondFallbackImage( url );
            }

            // normal operation
            else
            {
              // console.log('fetching');
              return fetch( request, fetch_config.images )
                .then( response => {
                  const copy = response.clone();
                  event.waitUntil(
                    saveToCache( "other", request, copy )
                  );
                  return response;
                })
                // fallback to offline image
                .catch(function(){
                  return respondFallbackImage( url, offline_image );
                });
            }
          }
        })
    );
  }

  // everything else - cache first, then network
  else
  {
    event.respondWith(
      // check the cache first
      caches.match( request )
        .then( cached_result => {
          if ( cached_result )
          {
            return cached_result;
          }

          // save data?
          if ( save_data )
          {
            return new Response( "", {
              status: 408,
              statusText: "This request was ignored to save data."
            });
          }
          
          // normal operation
          else
          {
            return fetch( request )
              .then( response => {
                const copy = response.clone();
                if ( isHighPriority( url ) )
                {
                  event.waitUntil(
                    saveToCache( "static", request, copy )
                  );
                }
                else
                {
                  event.waitUntil(
                    saveToCache( "other", request, copy )
                  );
                }
                return response;
              })
              // fallback to offline image
              .catch(function(){
                return new Response( "", {
                  status: 408,
                  statusText: "The server appears to be offline."
                });
              });
          }
        })
    );
  }

});