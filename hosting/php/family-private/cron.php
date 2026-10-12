<?php
declare(strict_types=1);
if (PHP_SAPI!=='cli') {http_response_code(404);exit;}
require __DIR__.'/core.php';require __DIR__.'/business.php';require __DIR__.'/audit.php';
try {$db=db(config());beginAudit($db,'Tự động lưu trữ','Hệ thống');sweep($db);finishAudit();echo "Family archive check complete.\n";}
catch (Throwable $e) {finishAudit(false);fwrite(STDERR,"Family archive check failed; verify configuration.\n");exit(1);}
