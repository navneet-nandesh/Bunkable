/* 
 * To change this template, choose Tools | Templates
 * and open the template in the editor.
 */

     $('.atnd_head').click(function(){
     if($('#sem'+$(this).attr('sem')).css('display')=='block')
         {
           $('#sem'+$(this).attr('sem')).slideUp('fast',function(){$(this).stop(true);});
            $(this).removeClass('selected_head');
         }
     else
         {
             bid=0;
             studid=0;
             $('.atnd_head'+' not:('+$(this)+')').each(function(){
             $(this).trigger('click')});
             $(this).addClass('selected_head');
             url='index.php/ecampus/attendancereport/'+$(this).attr('bid');
             $('#sem'+$(this).attr('sem')).html('<div align="center"><img src="asset/images/loading1.gif"><br> Loading</div>');
             $('#sem'+$(this).attr('sem')).load(url,{'batchid':bid});
             $('#sem'+$(this).attr('sem')).slideDown('fast',function(){$(this).stop(true);});
         }
           
           
       });
    
    
 
