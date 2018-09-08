app = {
	utils: {
		deepCopy: function(obj){
			return JSON.parse(JSON.stringify(obj));
		},
		init: function(){
			var padZero = function(len){
				var str = app.utils.deepCopy(this);
				while(str.length < len) str = '0' + str;
				return str;
			};
			String.prototype.padZero = padZero;
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
				var data = this.data[id]
				data['platform'] = app.restricted.plateToPlatform[data['plate'].substring(0,2)] || '???';
				data['date-stamp'] = data['date-ddmmyy'] + ' ' + data['date-hhss'];
				var thisMoment = moment(data['date-stamp'],'DDMMYY HH:mm')
				data['date-sort'] = Number(thisMoment.format('X')) * 1000000 + Number(data['odo-start']);
				data['date-top'] = thisMoment.format('HH:mm ddd')
				data['date-center'] = thisMoment.format('DD')
				data['date-bottom'] = thisMoment.format('MMM YY')
				data['odo'] = data['odo-start'] + ' - ' + data['odo-end'];
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
		init: function(){
			this.lf = localforage
			this.trips.DB = this.lf.createInstance({name:"tripDB"});
			this.trips.data = {};
			this.trips.DB.iterate(this.trips.import,function(){
				app.views.displayTrip.showPage();
				app.views.displayTrip.showPage();
			});
		}
	},

	session: {
		editTripNow: -1,
		displayedData: {},
		lastDisplayed: new Date(),
		doneDisplaying: false,
		stats: {
			needRefresh: true
		}
	},

	views: {
		init: function(){
			$('.tabs').tabs();
			$('.fixed-action-btn').floatingActionButton();
			$('.modal').modal();
			$('.datepicker').datepicker({
				format: 'ddmmyy',
				yearRange: 2,
				showDaysInNextAndPreviousMonths: true,
				autoClose: true,
				firstDay: 1,
				container: 'body'
			});
			$('.timepicker').timepicker({
				twelveHour: false,
				container: 'body'
			});
			this.editTrip.init();
			this.displayTrip.init();
			this.displayStats.init();
			this.preload.donePreload();
		},
		preload: {
			donePreload: function(){
				$('.preload-window').fadeOut(1000, function(){
					this.remove();
				});
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
				if(elem.scrollHeight - elem.scrollTop === elem.clientHeight
					&& now - app.session.lastDisplayed >= 500){
					app.session.lastDisplayed = now;
					app.views.displayTrip.showPage();
				}
			},
			showPage: function(){
				for(var i=0;i<10;i++){
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
					//entry.find('.display-trip-'+fieldsDisplay[i]).attr('data-val',entryData[fieldsDisplay[i]])
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
					$(window).scrollTop(entry.offset().top-150);
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
			fieldsInput: ['date-ddmmyy','date-hhss','plate','odo-start','odo-end'],
			fieldsMileage: 'mileage',
			numberOnly: function(){
				var fieldsInput = this.fieldsInput;
				var fieldsMileage = this.fieldsMileage;
				$('.edit-trip-number-only').on('input',function(e){
					$(this).val($(this).val().replace(/\D/g,''));
					$('#edit-trip-'+fieldsMileage).val(Math.max(
						Number($('#edit-trip-'+fieldsInput[4]).val()) 
							   - Number($('#edit-trip-'+fieldsInput[3]).val()),0
					) + 'km');
				});
			},
			validate: function(){
				var fail = 0;
				fail += $('#edit-trip-modal input:text').filter(function(){return $(this).val() == "";}).length;
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
				this.numberOnly();
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
				$('#tab-stats-btn').click(function(){displayStats.calcStats();displayStats.showStats()});
				$('#stats-nuke').click(function(){displayStats.clearData()});
				$('#stats-import-start').click(function(){displayStats.startImport()});
				$('#stats-import-format').change(function(){displayStats.checkFormat();displayStats.checkImport()});
				$('#stats-import-input').change(function(){displayStats.checkFormat();displayStats.checkImport()});
				$('#stats-import-done').click(function(){displayStats.endImport();});
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
				stats['platforms-days-since-used'] = {};
				stats['platforms-last-twoweek'] = {}
				stats['total-mileage'] = 0;
				stats['vehicles-favorite'] = null;
				$.each(trips.data, function(id,data){
					var plate = data['plate']
					var mileage = Math.max(Number(data['odo-end']) - Number(data['odo-start']),0);
					var platform = plate.substring(0,2);
					var thisMoment = moment(data['date-ddmmyy'],'DDMMYY');
					var daysSinceUsed = moment().diff(thisMoment,'days')
					stats['vehicles-mileage'][plate] = stats['vehicles-mileage'][plate] + mileage || mileage;
					stats['platforms-mileage'][platform] = stats['platforms-mileage'][platform] + mileage || mileage;
					stats['platforms-days-since-used'][platform] = Math.min(daysSinceUsed,stats['platforms-days-since-used'][platform]) || daysSinceUsed;
					stats['total-mileage'] = stats['total-mileage'] + mileage;
					if(stats['vehicles-favorite'] == null ||
						stats['vehicles-mileage'][stats['vehicles-favorite']] < stats['vehicles-mileage'][plate]){
						stats['vehicles-favorite'] = plate;
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
					var nextChart = $('#display-stats-platform-template').clone();
					nextChart.find('.display-stats-platform-label').text(app.restricted.plateToPlatform[id])
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
					$('#display-stats-platform-template').after(nextChart);
					nextChart.show();
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
				this.calcStats();
				this.showStats();
			},
			startImport: function(){
				$('#stats-import-check').val("");
				$('#stats-import-input').val("");
				$('#stats-import-done').addClass('disabled');
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
			checkFormat: function(){
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
					'date-hhmm': readData['H'] + readData['M'],
					'plate': readData['V'],
					'odo-start': readData['S'],
					'odo-end': readData['E']
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
			},
			endImport: function(){
				var source = $('#stats-import-input').val().split("\n");
				var pattern = $('#stats-import-format').val();
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
					var nid = app.stores.trips.create(data);
					app.views.displayTrip.showEntry(nid); //
					app.session.displayedData[nid] = true; //
				});
				app.session.stats.needRefresh = true; //
				this.calcStats();
				this.showStats();
			}
		}
	},
	restricted: {
		plateToPlatform: {
			'34': '34/OUV',
			'35': '35/JEEP',
			'46': '46/MB',
			'41': '41/GP',
			'59': '59/MB290',
			'32': '32/LR'
		}
	}
}

$(document).ready(function(){
	app.utils.init();
	app.views.init();
	app.stores.init();
});