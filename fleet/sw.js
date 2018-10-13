var CACHE_NAME = 'fleet-0016';

var urlsToCache = [
	'./',
	'./index.html',
	'./appmanifest.json',
	'./css/app.css',
	'./css/material-icons.css',
	'./css/material-icons.woff2',
	'./css/materialize.min.css',
	'./img/brand-logo.png',
	'./img/icon.png',
	'./img/icon_hd.png',
	'./img/ios_icon.png',
	'./img/ipadpro1_splash.png',
	'./img/ipadpro2_splash.png',
	'./img/ipad_splash.png',
	'./img/iphone5_splash.png',
	'./img/iphone6_splash.png',
	'./img/iphoneplus_splash.png',
	'./img/iphonex_splash.png',
	'./js/app.js',
	'./js/chart.bundle.min.js',
	'./js/jquery.min.js',
	'./js/localforage.min.js',
	'./js/materialize.min.js',
	'./js/moment.min.js'
];

self.addEventListener('install', function(event) {
	// Perform install steps
	event.waitUntil(
		caches.open(CACHE_NAME)
		.then(function(cache) {
			return cache.addAll(urlsToCache);
		})
	);
});

self.addEventListener('fetch', function(event) {
	event.respondWith(
		caches.match(event.request)
			.then(function(response) {
				if (response) {
					return response;
				}
				return fetch(event.request);
			}
		)
	);
});

self.addEventListener('activate', function(event) {
	event.waitUntil(
		caches.keys().then(function(cacheNames) {
			return Promise.all(
				cacheNames.map(function(cacheName) {
					if (cacheName != CACHE_NAME) {
						return caches.delete(cacheName);
					}
				})
			);
		})
	);
});
