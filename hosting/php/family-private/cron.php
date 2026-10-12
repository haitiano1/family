<?php
declare(strict_types=1);
if (PHP_SAPI!=='cli') {http_response_code(404);exit;}
require __DIR__.'/core.php';require __DIR__.'/business.php';
try {sweep(db(config()));echo "Family archive check complete.\n";}
catch (Throwable $e) {fwrite(STDERR,"Family archive check failed; verify configuration.\n");exit(1);}
