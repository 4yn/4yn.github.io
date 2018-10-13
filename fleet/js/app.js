app = {
	utils: {
		deepCopy: function(obj){
			return JSON.parse(JSON.stringify(obj));
		},
		deployServiceWorker: function(){
			if ('serviceWorker' in navigator) {
				window.addEventListener('load', function() {
					navigator.serviceWorker.register('./sw.js');
				});
			}
		},
		addToHomeScreen: function(){
			window.addEventListener('beforeinstallprompt', (e) => {
				e.preventDefault();
				$('#stats-add-to-home-screen').show();
				$('#stats-add-to-home-screen').click(function(){
					this.hide;
					e.prompt();
				});
				app.session.deferredPrompt = e; //
			});
		},
		init: function(){
			var padZero = function(len){
				var str = app.utils.deepCopy(this);
				while(str.length < len) str = '0' + str;
				return str;
			};
			String.prototype.padZero = padZero;
			this.deployServiceWorker();
			this.addToHomeScreen();
		}
	},

	stores: {
		lf: null,
		trips: {
			DB: null,
			data: {},
			nextId: 0,
			create: function(data){
				data['id'] = app.utils.deepCopy(this.nextId);
				data['ts-create'] = new Date();
				data['display'] = true;
				this.update(data['id'],data);
				this.nextId += 1;
				return data['id']
			},
			read: function(id, cb){
				this.DB.getItem(id).then(function(val){cb(val)});
			},
			update: function(id, data){
				data['plate'] = data['plate'].padZero(5);
				data['odo-start'] = data['odo-start'].padZero(5);
				data['odo-end'] = data['odo-end'].padZero(5);
				data['mileage'] = Math.max(Number(data['odo-end']) - Number(data['odo-start']),0) + 'km';
				data['ts-edit'] = new Date();
				this.data[id] = app.utils.deepCopy(data);
				this.DB.setItem(id,data);
				this.populate(id);
			},
			populate(id){
				var fleetProp = app.stores.fleet.getFleetProp;
				var data = this.data[id]
				data['platform'] = fleetProp(data['plate'],'lt');
				data['color'] = fleetProp(data['plate'],'lc');
				data['date-stamp'] = data['date-ddmmyy'] + ' ' + data['date-hhmm'];
				var thisMoment = moment(data['date-stamp'],'DDMMYY HH:mm')
				data['date-unix'] = Number(thisMoment.format('X'));
				data['date-sort'] = Number(thisMoment.format('X')) * 1000000 + Number(data['odo-start']);
				data['date-top'] = thisMoment.format('HH:mm ddd')
				data['date-center'] = thisMoment.format('DD')
				data['date-bottom'] = thisMoment.format('MMM YY')
				data['odo'] = data['odo-start'] + ' - ' + data['odo-end'];
			},
			checkLB(id){
				var data = this.data[id];
				var lb = null;
				$.each(this.data, function(id,entry){
					if(entry['plate']!=data['plate']) return;
					if(entry['date-unix']<data['date-unix']){
						if(!lb) lb = entry
						else if(entry['date-unix']>lb['date-unix']) lb = entry
					}
				});
				if(lb && data['odo-start']<lb['odo-end']){
					return "Odometer clashes with previous journey on " + lb['date-stamp'] + '</br>'
				} else {
					return null;
				}
			},
			checkUB(id){
				var data = this.data[id];
				var ub = null;
				$.each(this.data, function(id,entry){
					if(entry['plate']!=data['plate']) return;
					if(entry['date-unix']>data['date-unix']){
						if(!ub) ub = entry
						else if(entry['date-unix']<ub['date-unix']) ub = entry
					}
				});
				if(ub && data['odo-end']>ub['odo-start']){
					return "Odometer clashes with future journey on " + ub['date-stamp'] + '</br>'
				} else {
					return null;
				}
			},
			checkService(id){
				var data = this.data[id];
				var fleetProp = app.stores.fleet.getFleetProp
				var leftMileage = Number(fleetProp(data['plate'],'vsm')) - Number(data['odo-end']);
				if(leftMileage < 300){
					return "Vehicle has " + leftMileage + " km until next servicing" + '</br>';
				} else {
					return null
				}
			},
			delete: function(id){
				delete this.data[id];
				this.DB.removeItem(id);
			},
			nuke: function(){
				this.data = {};
				this.DB.clear();
			},
			import: function(value,key,idx){
				var trips = app.stores.trips; //rip
				trips.data[key] = value;
				app.stores.trips.populate(key); // gdi
				// app.views.displayTrip.showEntry(key);
				trips.nextId = Math.max(trips.nextId,Number(key)+1);
			}
		},
		fleet: {
			DB: null,
			data: null,
			import: function(value, key, idx){
				var fleet = app.stores.fleet; //rip
				fleet.data[key] = value;
			},
			setFleetKey: function(fleetKey){
				var fleet = app.stores.fleet; // rip
				fleet.DB.setItem('fleetKey',fleetKey);
				fleet.data['fleetKey'] = fleetKey;
			},
			loadFleet: function(){
				if(app.stores.fleet.data['fleetKey']==undefined || app.stores.fleet.data['fleetKey']==""){
					app.stores.fleet.setFleetCache({}); //
				};
				$.ajax({
					url: 'https://spreadsheets.google.com/feeds/list/' + app.stores.fleet.data['fleetKey'] + '/1/public/basic?alt=json',
					dataType: "json",
					success: function(data){
						var fleetData = {};
						$.each(data['feed']['entry'], function(idx, value){
							var k = value['title']['$t'];
							fleetData[k] = {};
							$.each(value['content']['$t'].split(','), function(idx, entry){
								fleetData[k][entry.split(':')[0].replace(/\s/g, '')] = entry.split(':')[1].replace(/\s/g, '');
							})
						});
						app.stores.fleet.setFleetCache(fleetData); // rippp
						setTimeout(function(){(window.location.reload)()},50);
					}
				})
			},
			setFleetCache: function(fleetData){
				var fleet = app.stores.fleet; // rip
				fleet.DB.setItem('fleetData',fleetData);
				fleet.data['fleetData'] = fleetData;
			},
			defaultFleetProp: {
				'lt': '???',
				'lc': '#212121',
				'vsm': '9999999'
			},
			getFleetProp: function(vehicle, property){
				var fleet = app.stores.fleet;
				if(fleet.data['fleetData'] && vehicle in fleet.data['fleetData']){
					return fleet.data['fleetData'][vehicle][property];
				} else {
					if(property == 'lt'){
						return vehicle;
					}
					return fleet.defaultFleetProp[property];
				}
			},
		},
		persist : function(){
			if(navigator.storage && navigator.storage.persist){
				navigator.storage.persisted().then(persistent => {
					if(!persistent){
						navigator.storage.persist();
					}
				})
			}
		},
		init: function(){
			this.lf = localforage
			this.persist();
			this.fleet.DB = this.lf.createInstance({name:"fleetDB"});
			this.fleet.data = {};
			this.fleet.DB.iterate(this.fleet.import);
			this.trips.DB = this.lf.createInstance({name:"tripDB"});
			this.trips.data = {};
			this.trips.DB.iterate(this.trips.import,function(){
				app.views.displayTrip.showPage();
				app.views.displayTrip.showPage();
			});
			//this.fleet.loadFleet();
		}
	},

	session: {
		editTripNow: -1,
		displayedData: {},
		lastDisplayed: new Date(),
		doneDisplaying: false,
		stats: {
			needRefresh: true
		},
		nowPrinting: 0,
		deferredPrompt: null
	},

	views: {
		init: function(){
			$('.tabs').tabs();
			$('.fixed-action-btn').floatingActionButton();
			$('.modal').modal();
			$('.tooltipped').tooltip();
			$('.datepicker').datepicker({
				format: 'ddmmyy',
				yearRange: 2,
				showDaysInNextAndPreviousMonths: true,
				autoClose: true,
				firstDay: 1,
				container: 'body',
				onClose: function(){
					app.views.editTrip.validate();
				}
			});
			$('.timepicker').timepicker({
				twelveHour: false,
				autoClose: true,
				container: 'body',
				onCloseStart: function(){
					app.views.editTrip.validate();
					setTimeout(0,function(){$('#edit-trip-date-hhmm').blur();});
				},
			});
			if('ontouchstart' in window && !window.matchMedia('(display-mode: standalone)').matches){
				$('#nav-save-prompt').show();
			}
			this.editTrip.init();
			this.displayTrip.init();
			this.displayStats.init();
			this.utils.init();
			this.preload.donePreload();
		},
		preload: {
			donePreload: function(){
				$('.preload-window').fadeOut(1000);
			},
			restartPreload: function(){
				$('.preload-window').fadeIn(1000);
			}
		},
		displayTrip: {
			fieldsDisplay: ['plate','mileage','date-top','date-center','date-bottom','date-sort','odo-start','odo-end','platform'],
			showNext: function(){
				if(this.doneDisplaying) return;
				var trips = app.stores.trips;
				var displayed = app.session.displayedData;
				maxid = -1;
				maxval = -1;
				$.each(trips.data, function(id,data){
					if(displayed[id]!=true && data['date-sort']>maxval){
						maxid = id
						maxval = data['date-sort']
					}
				});
				if(maxid!=-1){
					displayed[maxid] = true;
					this.showEntry(maxid);
				} else {
					doneDisplaying = true;
					$('#display-trip-loading').hide();
					$('#display-trip-last').show();
				}
			},
			checkPage: function(){
				var now = new Date();
				// if(window.innerHeight + window.scrollY > document.body.offsetHeight
				elem = $('#tab-trips')[0]
				if(Math.abs(0.0 + elem.scrollHeight - elem.scrollTop - elem.clientHeight) < 5
					&& now - app.session.lastDisplayed >= 500){
					app.session.lastDisplayed = now;
					app.views.displayTrip.showPage();
				}
			},
			showPage: function(){
				for(var i=0;i<12;i++){
					this.showNext();
				}
			},
			showEntry: function(id,scrollTo=false){
				var newEntry = $('#display-trip-template').clone();
				var entryData = app.stores.trips.data[id];
				var fieldsDisplay = this.fieldsDisplay;
				newEntry.attr('id','display-trip-' + id);
				newEntry.find('.display-trip-modify').click(function(){app.views.editTrip.startEdit(id);}); //
				$('#display-trip-wrapper').prepend(newEntry); //
				this.updateEntry(id,scrollTo,true);
				// scroll
			},
			updateEntry: function(id,scrollTo=false,newEntry=false){
				var entryData = app.stores.trips.data[id];
				var fieldsDisplay = this.fieldsDisplay;
				var entry = $('#display-trip-' + id);
				for(var i=0;i<fieldsDisplay.length;i++){
					entry.find('.display-trip-'+fieldsDisplay[i]).text(entryData[fieldsDisplay[i]]);
				}
				// color
				entry.find('.display-trip-vehiclebox .card').css('background-color',entryData['color']);
				// lower bound check
				var checkLB = app.stores.trips.checkLB(id);
				var checkUB = app.stores.trips.checkUB(id);
				var checkService = app.stores.trips.checkService(id);
				if(checkLB || checkUB || checkService){
					checkLB = checkLB || ""
					checkUB = checkUB || ""
					checkService = checkService || ""
					error = checkUB + checkLB + checkService
					entry.children().append('<div class="card-action">' + error + '</div>');
				} else {
					entry.find('.card-action').remove()
				}
				// maintain sort
				while(1){
					var next = entry.next();
					if(next.length > 0 && this.getSort(entry) < this.getSort(next)){
						next.after(entry);
					} else {
						break;
					}
				}
				while(1){
					var prev = entry.prev();
					if(prev.length > 0 && this.getSort(entry) > this.getSort(prev)){
						prev.before(entry);
					} else {
						break;
					}
				}
				if(scrollTo){
					$('#tab-trips').scrollTop(entry.offset().top-150);
				};
				if(newEntry){
					entry.show().fadeOut(0).fadeIn(500);
				} else {
					entry.fadeOut(250).fadeIn(250).fadeOut(250).fadeIn(250);;
				}
			},
			deleteEntry: function(id){
				var entry = $('#display-trip-' + id);
				entry.hide('slow', function(){ entry.remove(); });
			},
			nukeEntry: function(){
				$('#display-trip-template').toggleClass('display-trip-entry');
				$('.display-trip-entry').remove();
				$('#display-trip-template').toggleClass('display-trip-entry');
			},
			getSort: function(elem){
				return Number(elem.find('.display-trip-date-sort').text());
			},
			init: function(){
				var displayTrip = this;
				$('#tab-trips').scroll(function(){displayTrip.checkPage()});
			}
		},
		editTrip: {
			fieldsInput: ['date-ddmmyy','date-hhmm','plate','odo-start','odo-end'],
			fieldsMileage: 'mileage',
			updateMileage: function(){
				var fieldsInput = this.fieldsInput;
				var fieldsMileage = this.fieldsMileage;
				$('.edit-trip-update-mileage').on('change',function(e){
					$('#edit-trip-'+fieldsMileage).val(Math.max(
						Number($('#edit-trip-'+fieldsInput[4]).val()) 
							   - Number($('#edit-trip-'+fieldsInput[3]).val()),0
					) + 'km');
				});
			},
			validate: function(){
				var fail = 0;
				fail += $('#edit-trip-modal input:text').filter(function(){return $(this).val() == "";}).length;
				if(Number($('#edit-trip-odo-end').val()) < Number($('#edit-trip-odo-start').val())){
					fail += 1;
				}
				if(fail == 0){
					$('#edit-trip-done.disabled').removeClass('disabled');
				} else {
					$('#edit-trip-done:not(.disabled)').addClass('disabled');
				}
			},
			startEdit: function(id){
				var session = app.session;
				var fieldsInput = this.fieldsInput;
				var fieldsMileage = this.fieldsMileage;
				session.editTripNow = id;
				if(id!=-1){
					data = app.stores.trips.data[id];
					for(var i=0;i<fieldsInput.length;i++){
						$('#edit-trip-'+fieldsInput[i]).val(data[fieldsInput[i]]);
					}
					$('#edit-trip-'+fieldsMileage).val(data[fieldsMileage]);
					$('#edit-trip-delete').show();
				} else {
					for(var i=0;i<fieldsInput.length;i++){
						$('#edit-trip-'+fieldsInput[i]).val('');
					}
					$('#edit-trip-'+fieldsMileage).val('0');
					$('#edit-trip-delete').hide();
				}
				this.validate();
				M.updateTextFields();
			},
			deleteEdit: function(){
				var session = app.session;
				app.stores.trips.delete(session.editTripNow); //
				app.views.displayTrip.deleteEntry(session.editTripNow);
			},
			endEdit: function(){
				var session = app.session;
				session.stats.needRefresh = true;
				var data = {};
				var fieldsInput = this.fieldsInput;
				for(var i=0;i<fieldsInput.length;i++){
					data[fieldsInput[i]] = $('#edit-trip-'+fieldsInput[i]).val();
				}
				if(session.editTripNow == -1){
					var id = app.stores.trips.create(data); //
					app.views.displayTrip.showEntry(id,true); //
					app.session.displayedData[id] = true; //
				} else {
					app.stores.trips.update(session.editTripNow,data); //
					app.views.displayTrip.updateEntry(session.editTripNow, true); //
				}
			},
			init: function(){
				this.updateMileage();
				var editTrip = this;
				$('#edit-trip-create').click(function(){editTrip.startEdit(-1);});
				$('#edit-trip-delete').click(function(){editTrip.deleteEdit()});
				$('#edit-trip-done').click(function(){editTrip.endEdit()});
				$('#edit-trip-modal input:text').on('input',this.validate);
			}
		},
		displayStats: {
			init: function(){
				var displayStats = this;
				this.setChartGlobals();
				$('#tab-stats-btn').click(function(){displayStats.calcStats();displayStats.showStats()});
				$('#stats-nuke').click(function(){displayStats.clearData()});
				$('#stats-import-start').click(function(){displayStats.startImport()});
				$('#stats-import-format').change(function(){displayStats.checkImportFormat();displayStats.checkImport()});
				$('#stats-import-input').change(function(){displayStats.checkImportFormat();displayStats.checkImport()});
				$('#stats-import-done').click(function(){displayStats.endImport();});
				$('#stats-export-start').click(function(){displayStats.startExport()});
				$('#stats-export-format').change(function(){displayStats.checkExportFormat()});
				$('#stats-export-generate').click(function(){displayStats.generateExport()});
				$('#stats-export-copy').click(function(){displayStats.copyExport()});
				$('#stats-force-update').click(function(){displayStats.forceUpdate()});
				$('#stats-set-fleet').click(function(){displayStats.setFleetKey()});
				$('#stats-reload-fleet').click(function(){app.stores.fleet.loadFleet()}); // rip
			},
			setChartGlobals: function(){
				Chart.defaults.global.defaultFontColor = '#212121';
				// Chart.defaults.global.defaultFontSize = '15';
				Chart.defaults.global.defaultFontFamily = '"-apple-system","BlinkMacSystemFont","Segoe UI","Roboto","Oxygen-Sans","Ubuntu","Cantarell","Helvetica Neue","sans-serif"';
			},
			calcStats: function(){

				var stats = app.session.stats; //
				var trips = app.stores.trips; //

				if(!stats.needRefresh){
					return;
				}
				stats.needRefresh = false;

				stats['vehicles-mileage'] = {};
				stats['platforms-mileage'] = {};
				stats['platforms-color'] = {};
				stats['platforms-days-since-used'] = {};
				stats['platforms-last-twoweek'] = {}
				stats['total-mileage'] = 0;
				stats['vehicles-favorite'] = null;
				$.each(trips.data, function(id,data){
					var plate = data['plate']
					var mileage = Math.max(Number(data['odo-end']) - Number(data['odo-start']),0);
					var platform = app.stores.fleet.getFleetProp(plate,'lt'); // rip
					var thisMoment = moment(data['date-ddmmyy'],'DDMMYY');
					var daysSinceUsed = moment().diff(thisMoment,'days')
					stats['vehicles-mileage'][plate] = stats['vehicles-mileage'][plate] + mileage || mileage;
					stats['platforms-mileage'][platform] = stats['platforms-mileage'][platform] + mileage || mileage;
					stats['platforms-color'][platform] = app.stores.fleet.getFleetProp(plate,'lc');
					stats['platforms-days-since-used'][platform] = Math.min(daysSinceUsed,stats['platforms-days-since-used'][platform]) || daysSinceUsed;
					stats['total-mileage'] = stats['total-mileage'] + mileage;
					if(stats['vehicles-favorite'] == undefined ||
						stats['vehicles-mileage'][stats['vehicles-favorite']] < stats['vehicles-mileage'][plate]){
						stats['vehicles-favorite'] = plate;
					}
					if(daysSinceUsed < 14){
						if(stats['platforms-last-twoweek'][platform] == undefined){
							stats['platforms-last-twoweek'][platform] = Array(14).fill(0);
						}
						stats['platforms-last-twoweek'][platform][13 - daysSinceUsed] += mileage;
					}
				});
			},
			showStats: function(){
				var stats = app.session.stats; //
				$('#display-stats-mileage').text(stats['total-mileage'] + 'km');
				$('#display-stats-vehicles').text(Object.keys(stats['vehicles-mileage']).length);
				$('#display-stats-platforms').text(Object.keys(stats['platforms-mileage']).length);
				$('#display-stats-vehicles-favorite').text(stats['vehicles-favorite']);
				$('#display-stats-platform-template').toggleClass('display-stats-platform');
				$('.display-stats-platform').remove();
				$('#display-stats-platform-template').toggleClass('display-stats-platform');
				$.each(stats['platforms-days-since-used'], function(id,data){
					var fleetProp = app.stores.fleet.getFleetProp; // rip
					var nextChart = $('#display-stats-platform-template').clone();
					nextChart.find('.display-stats-platform-label').text(id)
					nextChart.find('.display-stats-platform-mileage').text(stats['platforms-mileage'][id] + 'km')
					var result = 'Driven ' + data + ' day' + ((data==1)?'':'s') + ' ago, ';
					if(data < 10){
						result += 11-data + ' days to JIT';
					} else if (data == 10){
						result += 'last day before JIT';
					} else {
						result += 'requires JIT';
					}
					nextChart.find('.display-stats-platform-jit').text(result);
					nextChart.find('.card').css('backgroundColor',stats['platforms-color'][id]) //
					$('#display-stats-platform-template').after(nextChart);
					nextChart.show();
				});

				// draw chart
				var ctxA = $('canvas#display-stats-history-A');
				var ctxB = $('canvas#display-stats-history-B');
				var labels = [];
				for(var i=-13;i<=0;i++){
					labels.push(moment().add(i,'days').format('DD/MM'));
				}
				var datasets = [];
				$.each(stats['platforms-last-twoweek'], function(platform,data){
					datasets.push({
						'label' : platform,
						'backgroundColor' : Chart.helpers.color(app.session.stats['platforms-color'][platform] || '#000000').alpha(0.3).rgbString(),
						'borderColor' : app.session.stats['platforms-color'][platform],
						'borderWidth' : 2,
						'data' : data}); //
				});

				var chartA = new Chart(ctxA, {
					'type': 'bar',
					'data': {
						'labels': labels,
						'datasets': datasets
					},
					'options': {
						'responsive': true,
						'hover': { 'mode': 'nearest', 'intersect': true },
						'legend': { 'labels' : { 'boxWidth': 20 } },
						'tooltips' : { 'position' : 'average', 'mode' : 'index', 'intersect' : false },
						'scales': {
							'xAxes': [{ 'scaleLabel': { 'display': true, 'labelString': 'Date', } }],
							'yAxes': [{
								'ticks' : { 'callback' : function(value,index,values){ return value + 'km';},
								'min' : 0},
								'scaleLabel' : { 'display' : true, 'labelString' : 'Mileage', }
							}]
						}
					}
				});
				var chartB = new Chart(ctxB, {
					'type': 'horizontalBar',
					'data': {
						'labels': labels,
						'datasets': datasets
					},
					'options': {
						'responsive': true,
						'hover': { 'mode': 'nearest', 'intersect': true },
						'legend': { 'labels' : { 'boxWidth': 20 } },
						'tooltips' : { 'position' : 'average', 'mode' : 'index', 'intersect' : false },
						'scales': {
							'yAxes': [{ 'scaleLabel': { 'display': true, 'labelString': 'Date', } }],
							'xAxes': [{
								'ticks' : {
									'callback' : function(value,index,values){ return value + 'km';},
									'min' : 0
								},
								'scaleLabel' : { 'display' : true, 'labelString' : 'Mileage', }
							}]
						}
					}
				});
			},
			clearData: function(){
				var trips = app.stores.trips //
				var displayTrip = app.views.displayTrip//
				var result = confirm("Delete all trips? (WARNING: CANNOT UNDO)")
				if(result){
					trips.nuke();
					displayTrip.nukeEntry();
					app.views.displayTrip.showNext();
				}
				app.session.stats.needRefresh = true; //
				M.toast({html: 'All data erased!'});
				this.calcStats();
				this.showStats();
			},
			startImport: function(){
				$('#stats-import-check').val("");
				$('#stats-import-input').val("");
				$('#stats-import-done').addClass('disabled');
				M.textareaAutoResize($('#stats-import-input'));
				M.textareaAutoResize($('#stats-import-check'));
				M.updateTextFields();
			},
			importFormat: {
				'd': { 'required': true, 'length': 2 },
				'm': { 'required': true, 'length': 2 },
				'y': { 'required': true, 'length': 2 },
				'V': { 'required': true, 'length': undefined },
				'S': { 'required': true, 'length': undefined },
				'E': { 'required': true, 'length': undefined },
				'H': { 'required': false, 'length': 2 },
				'M': { 'required': false, 'length': 2 },
				'D': { 'required': false, 'length': undefined }
			},
			checkImportFormat: function(){
				var displayStats = app.views.displayStats; // rip
				var format = $("#stats-import-format").val();
				var check = ""
				var ok = true;
				$.each(displayStats.importFormat, function(id,data){
					if(format.indexOf(id)==-1 && data['required']){
						ok = false;
					}
				});
				if(ok){
					$('#stats-import-input').prop('disabled',false);
					$('#stats-import-done').removeClass('disabled');
				} else {
					$('#stats-import-input').prop('disabled',true);
					$('#stats-import-done').addClass('disabled');
				}
			},
			parseImport: function(source,pattern){
				if(source.length < pattern.length){
					throw "Too few numbers";
				} else if (source.length > pattern.length){
					throw "Too many numbers";
				}
				var displayStats = app.views.displayStats;
				var readData = [];
				readData['H'] = "00";
				readData['M'] = "00";
				$.each(pattern,function(id,subpattern){
					var field = source[id];
					$.each(subpattern.split(''), function(sid,fieldType){
						var reqLength = displayStats.importFormat[fieldType]['length'];
						if(reqLength){
							if(field.length < reqLength) {
								throw "[" + fieldType + "] too short"
							}
							readData[fieldType] = field.substring(0,reqLength);
							field = field.substring(2);
						} else {
							if(field == ""){
								throw "[" + fieldType + "] missing";
							}
							readData[fieldType] = field;
							field =  "";
						}
					});
					if(field.length !=0){
						throw "[" + subpattern + "] excess";
					}
				});
				var data = {
					'date-ddmmyy': readData['d'] + readData['m'] + readData['y'] ,
					'date-hhmm': readData['H'] + ":" + readData['M'],
					'plate': readData['V'],
					'odo-start': readData['S'],
					'odo-end': readData['E']
				}
				if(readData['D']){
					if(Number(readData['D']) != Number(data['odo-end']) - Number(data['odo-start'])){
						throw 'Mileage incorrect';
					}
				}
				if(Number(data['odo-end']) < Number(data['odo-start'])){
					throw 'Negative mileage';
				}
				try{
					var thisMoment = moment(data['date-ddmmyy'] + ' ' + data['date-hhmm'],'DDMMYY HH:mm');
					if(!thisMoment.isValid()){
						console.log(thisMoment);
						throw 'Invalid date';
					}
				} catch {
					throw 'Invalid date';
				}
				return data;
			},
			checkImport: function(){
				var source = $('#stats-import-input').val().split("\n");
				var pattern = $('#stats-import-format').val();
				pattern = pattern.replace(/[^dmyVSEHMD]/g,' ').replace(/  +/g, ' ').split(" ").filter(function(e){
					return e
				});
				var check = '';
				var ok = true;
				$.each(source,function(id,text){
					text = text.replace(/\D/g,' ').replace(/  +/g, ' ').split(" ").filter(function(e){
						return e
					});
					if(text.length == 0){
						check += '\n';
						return;
					}
					source[id] = text;
					try{
						app.views.displayStats.parseImport(text,pattern) // rip
						check += 'OK';
					} catch(err){
						check += err;
						ok = false;
					} finally {
						check += '\n';
					}
				});
				check = check.slice(0,-1);
				$('#stats-import-check').val(check);
				if(ok){
					$('#stats-import-done').removeClass('disabled');
				} else {
					$('#stats-import-done').addClass('disabled');
				}
				M.updateTextFields();
				M.textareaAutoResize($('#stats-import-check'));
				M.textareaAutoResize($('#stats-import-input'));
			},
			endImport: function(){
				var source = $('#stats-import-input').val().split("\n");
				var pattern = $('#stats-import-format').val();
				var toImport = [];
				pattern = pattern.replace(/[^dmyVSEHMD]/g,' ').replace(/  +/g, ' ').split(" ").filter(function(e){
					return e
				});
				$.each(source,function(id,text){
					text = text.replace(/\D/g,' ').replace(/  +/g, ' ').split(" ").filter(function(e){
						return e
					});
					if(text.length == 0){
						return;
					}
					var data = app.views.displayStats.parseImport(text,pattern) // rip
					toImport.push(data);
					var nid = app.stores.trips.create(data);
					app.views.displayTrip.showEntry(nid); //
					app.session.displayedData[nid] = true; //
				});
				app.session.stats.needRefresh = true; //
				M.toast({html: 'Data imported'});
				this.calcStats();
				this.showStats();
			},
			startExport: function(){
				$('#stats-export-month').val('');
				$('#stats-export-year').val('');
				$('#stats-export-print').val('Ready to generate');
				M.textareaAutoResize($('#stats-export-print'));
				M.updateTextFields();
			},
			exportFormat: {
				'd': function(data){
					return data['date-ddmmyy'].substring(0,2);
				},
				'm': function(data){
					return data['date-ddmmyy'].substring(2,4);
				},
				'y': function(data){
					return data['date-ddmmyy'].substring(4,6);
				},
				'V': function(data){
					return data['plate'];
				},
				'S': function(data){
					return data['odo-start'];
				},
				'E': function(data){
					return data['odo-end'];
				},
				'H': function(data){
					return data['date-hhmm'].substring(0,2);
				},
				'M': function(data){
					return data['date-hhmm'].substring(3,5);
				},
				'D': function(data){
					return data['mileage'].slice(0,-2);
				},
				'P': function(data){
					return data['platform'];
				},
				'\#': function(data){
					return app.session.nowPrinting;
				},
				'T': function(data){
					return '\t';
				}
			},
			checkExportFormat: function(){
				var displayStats = app.views.displayStats; // rip
				var format = $("#stats-export-format").val();
				var check = "";
				var ok = true;
				for(var i=0;i<format.length;i++){
					var s = format[i];
					if(s=='!'){
						if(i == format.length-1){
							ok = false;
							check += 'Missing character after "!"\n';
						} else if (displayStats.exportFormat[format[i+1]] == undefined){
							ok = false;
							check += 'Unknown format "!' + format[i+1] + '"\n';
						}
						i++;
					}
				}
				if(check == ""){
					check = "Ready to Generate\n";
				}
				check = check.slice(0,-1);
				$("#stats-export-print").val(check);
				if(ok){
					$('#stats-export-generate').removeClass('disabled');
				} else {
					$('#stats-export-generate').addClass('disabled');
				}
				M.updateTextFields();
				M.textareaAutoResize($('#stats-export-print'));
			},
			generateExport: function(){
				var displayStats = app.views.displayStats; // rip
				var trips = app.stores.trips;
				var format = $('#stats-export-format').val();
				var month = -1;
				if($('#stats-export-month').val()!=""){
					month = Number($('#stats-export-month').val()) - 1;
				}
				var year = -1;
				if($('#stats-export-year').val()!=""){
					year = Number($('#stats-export-year').val());
					if(year < 100){
						year += 2000;
					}
				}
				var print = [];

				var allSorted = [];
				$.each(trips.data,function(id,val){
					allSorted.push({'id':id,'sort':val['date-sort']});
				});
				allSorted.sort(function(a,b){
					return a['sort'] - b['sort'];
				});

				app.session.nowPrinting = 0;
				$.each(allSorted,function(idx,val){
					var data = trips.data[val['id']];
					var thisMoment = moment(data['date-stamp'],'DDMMYY HH:mm')
					if(month!=-1 && month != thisMoment.month()){
						return;
					}
					if(year!=-1 && year != thisMoment.year()){
						return;
					}
					var thisPrint = ""
					app.session.nowPrinting += 1;
					for(var i=0;i<format.length;i++){
						var s = format[i];
						if(s=='!'){
							var p = format[i+1];
							thisPrint += displayStats.exportFormat[p](data);
							i++; 
						} else {
							thisPrint += s;
						}
					}
					print.push(thisPrint);
				});
				print = print.join('\n');
				$("#stats-export-print").val(print);
				M.updateTextFields();
				M.textareaAutoResize($('#stats-export-print'));
			},
			copyExport: function(){
				$("#stats-export-print").select();
				document.execCommand('copy');
				$("#stats-export-print").select();
				M.toast({html: 'Export copied'});
			},
			forceUpdate: function(){
				if(confirm('Force update of app? (Please be connected to the Internet)')){
					navigator.serviceWorker.getRegistrations().then(function(registrations) {
						for(let registration of registrations) {
							registration.unregister();
							setTimeout(function(){(window.location.reload)()},50);
						}
					});
				}
			},
			setFleetKey: function(){
				var fleetKey = prompt("Paste your Fleet Key below",app.stores.fleet.data['fleetKey']);
				if(fleetKey != null){
					app.stores.fleet.setFleetKey(fleetKey);
					app.stores.fleet.loadFleet();
				}
			}
		},
		utils: {
			init: function(){
				this.numberOnly();
			},
			numberOnly: function(){
				$('.utils-number-only').on('input',function(){
					$(this).val($(this).val().replace(/\D/g,''));
					$(this).change();
				});
			},
		}
	},
}

$(document).ready(function(){
	app.utils.init();
	app.views.init();
	app.stores.init();
});