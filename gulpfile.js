// Build scripts.

const [
    babel,
    uglify,
    gulp,
    rename,
    header
] = [require('gulp-babel')
    , require('gulp-uglify')
    , require('gulp')
    , require('gulp-rename')
    , require('gulp-header')];

const devFile = 'scroll.js';
const title = `/* InfiScroll */`;

// Build release script.
gulp.task('build', () => {
    return gulp.src(devFile)
        .pipe(babel({
            presets: ['@babel/env']
        }))
        .pipe(uglify())
        .pipe(rename('scroll.min.js'))
        .pipe(header(title))
        .pipe(gulp.dest('build'));
});