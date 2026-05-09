import { Component, Renderer2, ElementRef, OnInit, OnDestroy} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SignupService } from '../../services/signup.service';
import { ToastService } from '../../services/toast.service';
import { Title, Meta } from '@angular/platform-browser';
import { PaymentsService } from '../../services/payments.service';
import { FavoritesService } from '../../services/favorites.service';

@Component({
  selector: 'app-signin',
  templateUrl: './signin.component.html',
  styleUrl: './signin.component.css'
})
export class SigninComponent implements OnInit {

  redirectTarget = '/';

  constructor(private userService: SignupService, private toastService: ToastService, private renderer: Renderer2, private el: ElementRef, private titleService: Title, private metaService: Meta, private route: ActivatedRoute, private payments: PaymentsService, private favorites: FavoritesService) {}

  username: string = '';
  password: string = '';
  data: any = {
    email:'',
    password:''
  }
  imagePath: string = "https://images.pexels.com/photos/96857/pexels-photo-96857.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1"
  clicked: boolean = false;

  ngOnInit() {
    this.setMetaData();
    this.route.queryParams.subscribe((params) => {
      const r = params['redirect'];
      if (typeof r === 'string' && r.startsWith('/')) {
        this.redirectTarget = r;
      }
    });
  }

  setMetaData() {
    // Set the title
    this.titleService.setTitle('Sign In | TubeMusic.io  ');

    // Set the meta description
    this.metaService.updateTag({ name: 'description', content: 'Log in to your TubeMusic.io account to check music copyright, access free tracks, and manage your saved searches with ease.' });

  }

  onSubmit(): void {
    this.clicked = true;

    if(this.data) {
      this.userService.login(this.data).subscribe({
        next: (response: any) => {
          console.log('response', response.status)
          // get the status code
          if(response.status === 400) {
      
            this.toastService.showToast('error', 'Invalid credentials')
            return;
          }
          this.toastService.showToast('success', 'User logged in successfully')
          localStorage.setItem('token', response.body.token)
          const target = this.redirectTarget || '/';
          // Sync PRO entitlement + push device-local saves to the user's account
          // before the redirect so the next page paint already shows them.
          this.payments.refreshEntitlement().subscribe();
          this.favorites.promoteLocalToServer().subscribe((res) => {
            if (res.promoted > 0) {
              this.toastService.showToast(
                'success',
                `Synced ${res.promoted} saved track${res.promoted === 1 ? '' : 's'} to your account`
              );
            }
          });
          setTimeout(() => {
            window.location.href = target;
          } , 2000);

          this.data = {
            email: '',
            password: ''
          }
        },
        error: (error: any) => {
          this.toastService.showToast('error', `${error.statusText}`)
          // alert('login error')
          console.error('log in error', error)
          this.clicked = false;
        }
      })
  }
}

  goBack() {

    window.location.href = '/';
  }
  toggleForm() {
    const container = document.querySelector('.container');
    container?.classList.toggle('active');
  }

  ngOnDestroy() {
    this.renderer.removeStyle(this.el.nativeElement.ownerDocument.body, 'background-image');

  }


}
