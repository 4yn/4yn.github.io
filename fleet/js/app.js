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
				data['date-day'] = data['date-day'].padZero(2);
				data['date-month'] = data['date-month'].padZero(2);
				data['date-year'] = data['date-year'].padZero(2);
				data['date-hour'] = data['date-hour'].padZero(2);
				data['date-minute'] = data['date-minute'].padZero(2);
				data['plate'] = data['plate'].padZero(5);
				data['odo-start'] = data['odo-start'].padZero(5);
				data['odo-end'] = data['odo-end'].padZero(5);
				data['mileage'] = Math.max(Number(data['odo-end']) - Number(data['odo-start']),0) + 'km';
				data['ts-edit'] = new Date();
				data['date-stamp'] = data['date-day'] + data['date-month'] + data['date-year'] + ' ' + data['date-hour'] + data['date-minute'] + 'hrs';
				data['date-sort'] = data['date-year'] + data['date-month'] + data['date-day'] + data['date-hour'] + data['date-minute'] + data['odo-start'];
				data['odo'] = data['odo-start'] + ' - ' + data['odo-end'];
				this.data[id] = app.utils.deepCopy(data);
				this.DB.setItem(id,data);
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
				var trips = app.stores.trips; //fk
				trips.data[key] = value;
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
		stats: {}
	},

	views: {
		init: function(){
			$('.tabs').tabs();
			$('.fixed-action-btn').floatingActionButton();
			$('.modal').modal();
			this.editTrip.init();
			this.displayTrip.init();
			this.displayStats.init();
		},
		displayTrip: {
			fieldsDisplay: ['plate','mileage','date-stamp','date-sort','odo'],
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
				}
			},
			checkPage: function(){
				var now = new Date();
				if(window.innerHeight + window.scrollY > document.body.offsetHeight
					&& now - app.session.lastDisplayed >= 1000){
					app.session.lastDisplayed = now;
					app.views.displayTrip.showPage();
				}
			},
			showPage: function(){
				for(var i=0;i<10;i++){
					this.showNext();
				}
			},
			showEntry: function(id,scrollto=false){
				var newEntry = $('#display-trip-template').clone();
				var entryData = app.stores.trips.data[id];
				var fieldsDisplay = this.fieldsDisplay;
				newEntry.attr('id','display-trip-' + id);
				newEntry.find('.display-trip-modify').click(function(){app.views.editTrip.startEdit(id);}); //
				newEntry.show().fadeOut(0).fadeIn(500);
				$('#display-trip-wrapper').prepend(newEntry); //
				this.updateEntry(id);
				// scroll
				if(scrollto){$(window).scrollTop(entry.offset().top-150)}
			},
			updateEntry: function(id){
				var entryData = app.stores.trips.data[id];
				var fieldsDisplay = this.fieldsDisplay;
				var entry = $('#display-trip-' + id);
				for(var i=0;i<fieldsDisplay.length;i++){
					entry.find('.display-trip-'+fieldsDisplay[i]).text(entryData[fieldsDisplay[i]]);
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
				$(window).scroll(function(){displayTrip.checkPage()});
			}
		},
		editTrip: {
			fieldsInput: ['date-day','date-month','date-year','date-hour','date-minute',
						  'plate','odo-start','odo-end'],
			fieldsMileage: 'mileage',
			numberOnly: function(){
				var fieldsInput = this.fieldsInput;
				var fieldsMileage = this.fieldsMileage;
				$('.edit-trip-number-only').on('input',function(e){
					$(this).val($(this).val().replace(/\D/g,''));
					var idx = fieldsInput.findIndex(x => 'edit-trip-'+x === $(this).attr('id'));
					if(	idx < fieldsInput.length - 1 
						&& $(this).val().length == $(this).attr('maxlength')
						&& $('#edit-trip-'+fieldsInput[idx+1]).val().length == 0){
						$('#edit-trip-'+fieldsInput[idx+1]).focus();
					}
					$('#edit-trip-'+fieldsMileage).val(Math.max(
						Number($('#edit-trip-'+fieldsInput[7]).val()) 
							   - Number($('#edit-trip-'+fieldsInput[6]).val()),0
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
					setTimeout(function(){$('#edit-trip-'+fieldsInput[0]).trigger('focus')},0);
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
					app.views.displayTrip.updateEntry(session.editTripNow); //
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
				$('#stats-import').click(function(){displayStats.importData()});
				$('#stats-import-notime').click(function(){displayStats.importData(true)});
				$('#stats-nuke').click(function(){displayStats.clearData()});
			},
			calcStats: function(){
				var stats = app.session.stats; //
				var trips = app.stores.trips; //

				stats['vehicles'] = {};
				stats['platforms'] = {};
				stats['total'] = 0;
				stats['vehicles-favorite'] = null;
				$.each(trips.data, function(id,data){
					var plate = data['plate']
					var mileage = Math.max(Number(data['odo-end']) - Number(data['odo-start']),0);
					var platform = plate.substring(0,2);
					stats['vehicles'][plate] = stats['vehicles'][plate] + mileage || mileage;
					stats['platforms'][platform] = stats['platforms'][platform] + mileage || mileage;
					stats['total'] = stats['total'] + mileage;
					if(stats['vehicles-favorite'] == null ||
						stats['vehicles'][stats['vehicles-favorite']] < stats['vehicles'][plate]){
						stats['vehicles-favorite'] = plate;
					}
				});
			},
			showStats: function(){
				var stats = app.session.stats; //
				$('#display-stats-mileage').text(stats['total']);
				$('#display-stats-vehicles').text(Object.keys(stats['vehicles']).length);
				$('#display-stats-platforms').text(Object.keys(stats['platforms']).length);
				$('#display-stats-vehicles-favorite').text(stats['vehicles-favorite']);
			},
			importData: function(notime=false){
				var trips = app.stores.trips //
				var result = prompt("[DDMMYY] [License Plate] [Odometer Start]-[Odometer End] [Mileage]");
				if(result==null) return;
				var nums = result.replace(/\D/g,' ').replace(/  +/g, ' ').split(" ");
				console.log(nums)
				for(var i=0;i+4<nums.length;i+=5){
					var raw = [nums[i],nums[i+1],nums[i+2],nums[i+3],nums[i+4]];
					var data = {}
					app.session.editTripNow = -1;
					data['date-day'] = raw[0].substring(0,2).padZero(2);
					data['date-month'] = raw[0].substring(2,4).padZero(2);
					data['date-year'] = raw[0].substring(4,6).padZero(2);
					if(notime){
						data['date-hour'] = "00";
						data['date-minute'] = "00";
					} else {
						data['date-hour'] = raw[0].substring(6,8).padZero(2);
						data['date-minute'] = raw[0].substring(8,10).padZero(2);
					}
					data['plate'] = raw[1].padZero(5);
					data['odo-start'] = raw[2].padZero(5);
					data['odo-end'] = raw[3].padZero(5);
					var id = trips.create(data);
					app.views.displayTrip.showEntry(id);
					app.session.displayedData[id] = true;
				}
			},
			clearData: function(){
				var trips = app.stores.trips //
				var displayTrip = app.views.displayTrip//
				var result = confirm("Delete all trips? (WARNING: CANNOT UNDO)")
				if(result){
					trips.nuke();
					displayTrip.nukeEntry();
				}
			}
		}
	}
}

$(document).ready(function(){
	app.utils.init();
	app.views.init();
	app.stores.init();
});