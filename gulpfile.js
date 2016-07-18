var streamConvert = require('vinyl-source-stream');
var ngAnnotate = require('gulp-ng-annotate');
var browserify = require('browserify');
var buffer = require('vinyl-buffer');
var jshint = require('gulp-jshint');
var rename = require('gulp-rename');
var uglify = require('gulp-uglify');
var gulp = require('gulp');

gulp.task('jshint-castmydata', function() {
    return gulp.src([
            './src/castmydata.js',
            './src/modules/**/*.js',
            './src/storage/**/*.js',
            './src/utils/**/*.js'
        ])
        .pipe(jshint())
        .pipe(jshint.reporter('default'));
});

gulp.task('jshint-ngcastmydata', function() {
    return gulp.src([
            './src/ng-castmydata.js',
        ])
        .pipe(jshint())
        .pipe(jshint.reporter('default'));
});

gulp.task('castmydata', ['jshint-castmydata'], function() {
    var bundler = browserify({
        debug: true,
        standalone: 'CastMyData',
    })
    .ignore('socket.io-client')
    .ignore('node-localstorage')
    .require('./src/castmydata.js', {
        expose: 'castmydata-jsclient',
    });
    return bundler.bundle()
        .pipe(streamConvert('castmydata.js'))
        .pipe(gulp.dest('dist'))
        .pipe(buffer())
        .pipe(rename('castmydata.min.js'))
        .pipe(uglify())
        .pipe(gulp.dest('dist'));
});

gulp.task('ng-castmydata', ['jshint-ngcastmydata'], function() {
    return gulp.src('./src/ng-castmydata.js')
        .pipe(ngAnnotate())
        .pipe(gulp.dest('dist'))
        .pipe(rename('ng-castmydata.min.js'))
        .pipe(uglify())
        .pipe(gulp.dest('dist'));
});

gulp.task('default', ['castmydata', 'ng-castmydata']);